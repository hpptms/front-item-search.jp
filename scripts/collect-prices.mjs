// 価格スナップショットの収集。キーワード LP（/s/<slug>）ごとに backend の横断検索を
// 1 回叩き、サイト別の価格帯・代表商品と日次の価格推移を data/prices/<slug>.json に保存する。
//
// 目的: /s/<slug> の静的 HTML に「その日の実データ」を載せ、Google に薄いページと
// 判定されないようにすること（テンプレ文だけのページはインデックスから外される）。
// 生成した JSON は scripts/prerender.mjs が静的 HTML に焼き込み、React 側
// （src/pages/KeywordLanding.tsx）も同じものを読む。
//
// 【実行場所】本番 backend が動いているこの Mac 上。毎日 scripts/daily-prices.sh から
// 呼ばれ、結果を commit → push すると Cloudflare Pages が自動ビルドする。
// Pages のビルド環境からは backend を叩かない（秘密を渡さずに済み、backend が
// 落ちていても前回 commit 済みのデータでビルドできる）。
//
// 【環境変数】
//   BACKEND_URL   既定 http://localhost:8080
//   PROXY_SECRET  未設定なら ../.env（serch/.env）から読む
//   ONLY          カンマ区切りの slug だけ収集する（動作確認用）
//
// 依存なし（Node 標準のみ）。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "data", "prices");

const BACKEND = (process.env.BACKEND_URL || "http://localhost:8080").replace(/\/$/, "");
const ONLY = new Set(
  (process.env.ONLY || "").split(",").map((s) => s.trim()).filter(Boolean)
);

// 1 サイトあたりの取得件数（backend の上限は 50）。
const LIMIT = 20;
// 1 サイトあたり JSON に残す代表商品の件数（安い順）。
const ITEMS_PER_SITE = 3;
// 価格推移を何日分残すか。
const HISTORY_DAYS = 120;
// backend のレート制限（既定 5 秒に 1 回・バースト 3）を超えないための間隔。
const INTERVAL_MS = 6000;
// この件数未満のサイトしか取れなかった回は「backend 側の障害」とみなし、
// 前回のデータを上書きしない（推移にも記録しない）。
const MIN_SITES_TO_SAVE = 2;
// 代表価格の何割未満を「本体ではない安価な付属品・関連商品」とみなして
// 最安値の計算から外すか（例: PS5 の検索結果に混ざる 980 円のケーブル）。
const OUTLIER_RATIO = 0.3;

// フリマ・オークション（中古中心）。新品の最安値とは混ぜずに別集計する。
const USED_SITES = new Set(["mercari", "yahoo_auction"]);
// ショップ系サイトでも商品名にこれが入っていれば中古扱いにする
// （Yahoo!ショッピングの「中古即納」、楽天の「整備済み品」等）。
const USED_TITLE = /中古|整備済|リファービッシュ|再生品|未使用に近い|美品|[A-DＡ-Ｄ]ランク|ジャンク/i;

async function proxySecret() {
  if (process.env.PROXY_SECRET) return process.env.PROXY_SECRET;
  try {
    const env = await readFile(join(ROOT, "..", ".env"), "utf8");
    return env.match(/^PROXY_SECRET=(.*)$/m)?.[1]?.trim() ?? "";
  } catch {
    return "";
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// JST の今日（YYYY-MM-DD）。
function jstDate(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// 商品名の先頭や途中に挟まる販促文（【エントリーで最大2万ポイント…】等）を落とす。
function cleanTitle(t) {
  return String(t)
    .replace(/【[^】]{0,60}】/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function median(sorted) {
  if (sorted.length === 0) return null;
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : Math.round((sorted[m - 1] + sorted[m]) / 2);
}

// 収集条件（keywords.json の price）の照合用に正規化する。全角半角・大小文字・
// 空白の揺れ（「ブレス オブ ザ ワイルド」と「ブレスオブザワイルド」等）を吸収する。
const norm = (t) => String(t).normalize("NFKC").toLowerCase().replace(/[\s\u3000]+/g, "");

// keywords.json の price 条件に合う商品か。条件はキーワードごとの「本体だけを拾う」
// ための手書きの絞り込み（例: PS5 の検索結果に混ざるソフトや冷却スタンドを外す）。
function matches(item, rule = {}) {
  if (rule.min && item.price < rule.min) return false;
  if (rule.max && item.price > rule.max) return false;
  const t = norm(item.title);
  if (rule.include?.length && !rule.include.some((w) => t.includes(norm(w)))) return false;
  if (rule.require?.length && !rule.require.some((w) => t.includes(norm(w)))) return false;
  if (rule.exclude?.some((w) => t.includes(norm(w)))) return false;
  return true;
}

// 静的 HTML に載せてよい商品か。
function usable(item) {
  if (!(item.price > 0) || !item.title || !item.url) return false;
  if (!/^https:\/\//.test(item.url)) return false;
  return true;
}

// 1 キーワード分の検索結果を集計する。
// 商品ごとに新品/中古を判定し、最安値・中央値は新品と中古で分けて出す
// （中古の 4 万円と新品の 5 万円を同列に「最安値」と呼ばないため）。
function summarize(res, rule) {
  const sites = [];
  for (const s of res.sites || []) {
    const items = (s.items || [])
      .filter((i) => usable(i) && matches(i, rule))
      .map((i) => {
        const title = cleanTitle(i.title);
        return {
          title,
          price: i.price,
          url: i.url,
          shop: i.shop || "",
          used: USED_SITES.has(s.site) || USED_TITLE.test(title),
        };
      });
    if (items.length > 0) sites.push({ site: s.site, label: s.label, items });
  }

  // 新品・中古それぞれの代表価格（中央値）の OUTLIER_RATIO 未満は、条件を
  // すり抜けた付属品・関連商品とみなして外す。
  const floor = {};
  for (const used of [false, true]) {
    const ps = sites
      .flatMap((s) => s.items.filter((i) => i.used === used).map((i) => i.price))
      .sort((a, b) => a - b);
    floor[used] = Math.round((median(ps) ?? 0) * OUTLIER_RATIO);
  }

  const out = [];
  for (const s of sites) {
    const kept = s.items.filter((i) => i.price >= floor[i.used]).sort((a, b) => a.price - b.price);
    if (kept.length === 0) continue;
    // サイト別の最安・中央値は、そのサイト本来のコンディション（ショップなら新品系、
    // フリマなら中古）の商品で出す。ショップに混ざる「中古即納」等で表の最安が
    // 要約文の「ショップ最安」とずれないようにするため。該当が無ければ全商品で出す。
    const siteUsed = USED_SITES.has(s.site);
    const own = kept.filter((i) => i.used === siteUsed);
    const prices = (own.length ? own : kept).map((i) => i.price);
    out.push({
      site: s.site,
      label: s.label,
      used: siteUsed,
      count: prices.length,
      min: prices[0],
      median: median(prices),
      max: prices.at(-1),
      items: kept.slice(0, ITEMS_PER_SITE),
      _all: kept,
    });
  }
  // 安いサイト順（ショップ系 → フリマ・オークション系）。
  out.sort((a, b) => Number(a.used) - Number(b.used) || a.min - b.min);

  const pick = (used) => {
    // サイトごとに該当コンディションの商品だけで最安・中央値を取る。
    const per = out
      .map((s) => {
        const ps = s._all.filter((i) => i.used === used);
        return ps.length ? { s, best: ps[0], med: median(ps.map((i) => i.price)), n: ps.length } : null;
      })
      .filter(Boolean);
    if (per.length === 0) return null;
    const top = per.reduce((a, b) => (b.best.price < a.best.price ? b : a));
    return {
      min: top.best.price,
      minSite: top.s.site,
      minLabel: top.s.label,
      minTitle: top.best.title,
      // 中央値はサイトごとの中央値の中央値（件数の多いサイトに引っ張られないように）。
      median: median(per.map((p) => p.med).sort((a, b) => a - b)),
      siteCount: per.length,
      itemCount: per.reduce((n, p) => n + p.n, 0),
    };
  };
  const newSummary = pick(false);
  const usedSummary = pick(true);
  for (const s of out) delete s._all;
  return { sites: out, newSummary, usedSummary };
}

async function readPrev(slug) {
  try {
    return JSON.parse(await readFile(join(OUT_DIR, `${slug}.json`), "utf8"));
  } catch {
    return null;
  }
}

async function search(term, secret) {
  const url = `${BACKEND}/api/search?q=${encodeURIComponent(term)}&limit=${LIMIT}`;
  const res = await fetch(url, {
    headers: {
      "X-Proxy-Secret": secret,
      // 機械的な検索なので検索数ランキングに数えさせない（backend の recordSearch）。
      "X-Stats-Skip": "1",
      "X-Client-IP": "127.0.0.1",
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// --- main -----------------------------------------------------------------
const { keywords } = JSON.parse(
  await readFile(join(ROOT, "src/landing/keywords.json"), "utf8")
);
const secret = await proxySecret();
await mkdir(OUT_DIR, { recursive: true });

const today = jstDate();
const now = new Date().toISOString();
let saved = 0;
let skipped = 0;
// price 条件の無い語（canonical で正規ページを指す重複語など）は収集しない。
const targets = keywords.filter((k) => k.price && (ONLY.size === 0 || ONLY.has(k.slug)));

for (const [idx, k] of targets.entries()) {
  if (idx > 0) await sleep(INTERVAL_MS);
  let res;
  try {
    res = await search(k.price.query || k.term, secret);
  } catch (e) {
    console.log(`collect-prices: ${k.slug}: 検索失敗（前回データを維持）: ${e.message}`);
    skipped++;
    continue;
  }
  const { sites, newSummary, usedSummary } = summarize(res, k.price);
  const failed = (res.sites || []).filter((s) => s.error).map((s) => s.site);
  if (sites.length < MIN_SITES_TO_SAVE) {
    console.log(
      `collect-prices: ${k.slug}: 取得できたサイトが ${sites.length} 件のみ（前回データを維持）`
    );
    skipped++;
    continue;
  }

  const prev = await readPrev(k.slug);
  const history = (prev?.history || []).filter((h) => h.date !== today);
  history.push({
    date: today,
    newMin: newSummary?.min ?? null,
    newMedian: newSummary?.median ?? null,
    usedMin: usedSummary?.min ?? null,
    usedMedian: usedSummary?.median ?? null,
    sites: Object.fromEntries(sites.map((s) => [s.site, s.min])),
  });
  history.sort((a, b) => a.date.localeCompare(b.date));

  const data = {
    slug: k.slug,
    term: k.term,
    date: today,
    capturedAt: now,
    sites,
    newSummary,
    usedSummary,
    history: history.slice(-HISTORY_DAYS),
  };
  await writeFile(join(OUT_DIR, `${k.slug}.json`), JSON.stringify(data, null, 1) + "\n", "utf8");
  saved++;
  console.log(
    `collect-prices: ${k.slug}: ${sites.length} サイト / 新品最安 ${
      newSummary ? newSummary.min.toLocaleString("ja-JP") + "円" : "-"
    }${failed.length ? `（取得失敗: ${failed.join(",")}）` : ""}`
  );
}

console.log(`collect-prices: 保存 ${saved} 件 / 維持 ${skipped} 件（${today}）`);
// 1 件も取れなかった＝backend が死んでいる。呼び出し元（daily-prices.sh）に知らせる。
if (saved === 0 && targets.length > 0) process.exit(1);
