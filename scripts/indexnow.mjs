// IndexNow 送信。ビルド（prerender）の後に走り、更新のあった URL だけを通知する。
//
// IndexNow に対応しているのは Bing / Yandex / Seznam / Naver で、Google は非対応。
// Bing のインデックスは DuckDuckGo や ChatGPT の検索も参照するため、AI 検索経由の
// 流入を早めるのが狙い。Google 向けは従来どおり sitemap + Search Console に任せる。
//
// 【何を送るか】
// dist/sitemap.xml（今回のビルド）と、本番に今出ている sitemap.xml（前回のデプロイ）を
// 突き合わせ、「新しく増えた URL」と「lastmod が変わった URL」だけを送る。
// 中身が変わっていない URL を毎回 ping すると Bing 側でスロットルされるため、
// 同じ内容で何度デプロイしても送信は 0 件になるようにしてある。
//
// 【いつ送るか】
// Cloudflare Pages の本番ビルド（CF_PAGES_BRANCH === "main"）でのみ実際に送信する。
// ローカルビルドやプレビューデプロイでは、送る予定の URL を表示するだけ（dry-run）。
//
// 【手動実行】
//   node scripts/indexnow.mjs --all --force   全 URL を送る（導入直後の初回登録用）
//   node scripts/indexnow.mjs --dry-run       送信対象を確認するだけ
//
// このスクリプトが失敗してもビルドは落とさない（SEO 通知の失敗でデプロイを
// 止める理由はないため）。必ず exit 0 で終わる。

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, "..", "dist");

const ORIGIN = "https://item-search.jp";
const HOST = "item-search.jp";

// public/<KEY>.txt として配信される公開鍵。秘密情報ではない（IndexNow の仕様上、
// 所有権確認のためにこの URL が誰でも取得できる必要がある）。
const KEY = "26793a9a23ed5ad8aedcc1533405092b";
const KEY_LOCATION = `${ORIGIN}/${KEY}.txt`;

const ENDPOINT = "https://api.indexnow.org/indexnow";

// 1リクエストの上限は仕様上 10,000 件。ここは事故防止の安全弁。
const MAX_URLS = 500;

const args = new Set(process.argv.slice(2));
const SEND_ALL = args.has("--all");
const FORCE = args.has("--force");
const DRY_RUN = args.has("--dry-run");

const log = (msg) => console.log(`indexnow: ${msg}`);

// sitemap.xml から URL → lastmod のマップを作る。
function parseSitemap(xml) {
  const map = new Map();
  for (const [, entry] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = entry.match(/<loc>(.*?)<\/loc>/)?.[1];
    if (!loc) continue;
    map.set(loc, entry.match(/<lastmod>(.*?)<\/lastmod>/)?.[1] ?? "");
  }
  return map;
}

async function fetchText(url, init) {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15000),
  });
  return { ok: res.ok, status: res.status, text: await res.text() };
}

async function main() {
  if (process.env.INDEXNOW_DISABLE === "1") {
    log("INDEXNOW_DISABLE=1 のためスキップ");
    return;
  }
  // fetch / AbortSignal.timeout は Node 18 以降。ビルド環境が古い場合は静かに諦める。
  if (typeof fetch !== "function" || typeof AbortSignal?.timeout !== "function") {
    log(`Node ${process.version} では fetch が使えないためスキップ（Node 18 以降が必要）`);
    return;
  }

  const current = parseSitemap(await readFile(join(DIST, "sitemap.xml"), "utf8"));
  if (current.size === 0) {
    log("dist/sitemap.xml に URL が無い。スキップ");
    return;
  }

  // 送信対象を決める。
  let targets;
  if (SEND_ALL) {
    targets = [...current.keys()];
    log(`--all 指定: 全 ${targets.length} URL を対象にする`);
  } else {
    let previous;
    try {
      const res = await fetchText(`${ORIGIN}/sitemap.xml`);
      previous = res.ok ? parseSitemap(res.text) : null;
    } catch (e) {
      previous = null;
      log(`本番 sitemap の取得に失敗: ${e.message}`);
    }

    if (!previous || previous.size === 0) {
      // 前回分と比較できないときは、送りすぎるより送らないほうを選ぶ。
      // 初回登録は `--all --force` で手動実行する。
      log("前回の sitemap と比較できないためスキップ（初回は --all --force で送信）");
      return;
    }

    targets = [...current].filter(([loc, mod]) => previous.get(loc) !== mod).map(([loc]) => loc);
    const added = targets.filter((u) => !previous.has(u)).length;
    log(`差分: ${targets.length} URL（新規 ${added} / 更新 ${targets.length - added}）`);
  }

  if (targets.length === 0) {
    log("更新された URL は無し。送信しない");
    return;
  }
  if (targets.length > MAX_URLS) {
    log(`対象が ${targets.length} 件で上限 ${MAX_URLS} を超えたため中止（想定外の差分）`);
    return;
  }

  // Cloudflare Pages の本番ビルド以外では送らない。
  const isProdBuild = process.env.CF_PAGES_BRANCH === "main";
  if (DRY_RUN || (!isProdBuild && !FORCE)) {
    const why = DRY_RUN ? "--dry-run" : `CF_PAGES_BRANCH=${process.env.CF_PAGES_BRANCH ?? "(未設定)"}`;
    log(`送信しない（${why}）。対象 ${targets.length} URL:`);
    for (const u of targets) console.log(`  ${u}`);
    return;
  }

  // 鍵ファイルが本番で配信済みかを確認する。未配信のまま送ると Bing 側の
  // 所有権確認に失敗するため、その回は送らず次回のデプロイに回す。
  try {
    const key = await fetchText(KEY_LOCATION);
    if (!key.ok || key.text.trim() !== KEY) {
      log(`鍵ファイルが未配信または内容不一致（${KEY_LOCATION} → ${key.status}）。今回は送信しない`);
      return;
    }
  } catch (e) {
    log(`鍵ファイルの確認に失敗: ${e.message}。今回は送信しない`);
    return;
  }

  const body = JSON.stringify({
    host: HOST,
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList: targets,
  });

  const res = await fetchText(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body,
  });

  // 200 = 受理、202 = 受理（鍵の検証待ち）。どちらも成功扱い。
  if (res.status === 200 || res.status === 202) {
    log(`送信成功 (${res.status}): ${targets.length} URL`);
  } else {
    log(`送信失敗 (${res.status}): ${res.text.slice(0, 200)}`);
  }
  for (const u of targets) console.log(`  ${u}`);
}

try {
  await main();
} catch (e) {
  // ビルドは落とさない。
  log(`エラーのため中止: ${e.stack ?? e.message}`);
}
