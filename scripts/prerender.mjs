// ビルド後プリレンダ。dist/index.html をテンプレートに、
//   - トップ（/）/ カテゴリ LP（/c/<slug>）/ キーワード LP（/s/<slug>）
//   - ランキング LP（/ranking）: ItemList 構造化データ付き
//   - /about, /terms, /privacy
// の固有 <head>（title / description / canonical / OGP / 構造化データ）を焼き込み、
// sitemap.xml を再生成する。本文（#root）は空のままで、React が最初から描画する
// （以前は静的本文を焼き込んでいたが、JS 起動までの一瞬だけ素の HTML が見えるため廃止）。
//
// 依存なし（Node 標準のみ）。package.json の build から呼ばれる。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = join(ROOT, "dist");
const ORIGIN = "https://item-search.jp";

// --- 情報源 ---------------------------------------------------------------
const { categories, updated } = JSON.parse(
  await readFile(join(ROOT, "src/landing/categories.json"), "utf8")
);
const { keywords, updated: kwUpdated } = JSON.parse(
  await readFile(join(ROOT, "src/landing/keywords.json"), "utf8")
);
const ranking = JSON.parse(
  await readFile(join(ROOT, "src/landing/ranking.json"), "utf8")
);

// キーワード LP の価格スナップショット（scripts/collect-prices.mjs が毎日更新して
// commit する data/prices/<slug>.json）。無い語は undefined。
const prices = new Map();
for (const k of keywords) {
  try {
    prices.set(
      k.slug,
      JSON.parse(await readFile(join(ROOT, "data", "prices", `${k.slug}.json`), "utf8"))
    );
  } catch {
    // 未収集（追加直後の語など）。下の priceState() で noindex になる。
  }
}

// ランキングの集計期間ラベル（例: 2026年8月）。ranking.json に固定文字列を
// 持たせると月が変わっても古いままになるので、ビルド時の日付から作る。
// 画面側（JS 起動後）は src/landing/index.ts の rankingPeriodLabel() が
// 同じ計算をして常に現在の月に更新する。集計は JST 基準。
const RANKING_PERIOD = (() => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const num = (t) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  return `${num("year")}年${num("month")}月`;
})();

// トップ（/）の <head>（src/seo.ts の ROUTE_SEO["/"] と内容を合わせる）。
const HOME = {
  title: "商品横断検索 | 楽天・Yahoo!・メルカリを一括比較 - item-search.jp",
  description:
    "楽天市場・Yahoo!ショッピング・メルカリ・ヤフオク・ヨドバシ・ビックカメラを横断して一括検索。サイトをまたいで価格を比較し、ほしい商品の最安値を見つけられる無料の通販横断検索サービスです。",
};

// トップ・固定ページの最終更新日。文言を変えたらここも更新する。
// sitemap の lastmod になり、scripts/indexnow.mjs の「変わった URL だけ送る」
// 判定にも使われる（更新し忘れると IndexNow に通知が飛ばない）。
const HOME_UPDATED = "2026-07-27";
const STATIC_UPDATED = "2026-07-27";

// /about, /terms, /privacy の <head>（src/seo.ts の ROUTE_SEO と内容を合わせる）。
// h1 は各ページの src/pages/*.tsx で PageLayout に渡している title と揃える。
const STATIC_PAGES = [
  {
    path: "/about",
    title: "サイトの説明・使い方 | item-search.jp 商品横断検索",
    description:
      "item-search.jp は複数の通販サイトを横断して商品を一括検索できるサービスです。対応ショップ・使い方・よくある質問をまとめています。",
    h1: "サイトの説明",
    changefreq: "monthly",
    priority: "0.5",
    updated: STATIC_UPDATED,
  },
  {
    path: "/terms",
    title: "利用規約 | item-search.jp 商品横断検索",
    description:
      "item-search.jp（商品横断検索サービス）の利用規約です。サービスの内容、価格情報の扱い、アフィリエイト、免責事項などを定めています。",
    h1: "利用規約",
    updatedAt: "2026年7月27日",
    changefreq: "yearly",
    priority: "0.3",
    updated: STATIC_UPDATED,
  },
  {
    path: "/privacy",
    title: "プライバシーポリシー・運営者情報 | item-search.jp",
    description:
      "item-search.jp のプライバシーポリシーです。Googleアナリティクスやアフィリエイト Cookie の利用、検索履歴の扱い、運営者情報・お問い合わせ先を記載しています。",
    h1: "プライバシーポリシー",
    updatedAt: "2026年7月27日",
    changefreq: "yearly",
    priority: "0.3",
    updated: STATIC_UPDATED,
  },
];

// /about, /terms, /privacy の WebPage + パンくず構造化データ。
function staticPageJsonLd(p) {
  const url = ORIGIN + withSlash(p.path);
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: p.h1,
    url,
    description: p.description,
    inLanguage: "ja",
    isPartOf: { "@type": "WebSite", name: "item-search.jp", url: `${ORIGIN}/` },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "ホーム", item: `${ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: p.h1, item: url },
      ],
    },
  };
}

// 末尾スラッシュ付きに正規化する。
// Cloudflare Pages は dist/<path>/index.html を「/<path>/」で配信し、スラッシュ無しの
// アクセスは 308 でスラッシュ付きへ飛ばす。canonical・sitemap・サイト内リンクを
// すべてスラッシュ付きに揃え、canonical がリダイレクトする URL を指す状態を無くす。
function withSlash(path) {
  const [, p = path, rest = ""] = path.match(/^([^?#]*)([?#].*)?$/) ?? [];
  if (p === "" || p === "/") return "/" + rest;
  return (p.endsWith("/") ? p : p + "/") + rest;
}

const esc = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

// テンプレート中の1つのタグ（属性内 content）を差し替える。無ければ末尾追記はしない。
function replaceMeta(html, matcher, replacement) {
  return html.replace(matcher, replacement);
}

// index.html テンプレートの <head> を、指定の title / description / canonical /
// OGP に置換する。本文（#root）は空のままにし、React がそのまま描画する。
function render(
  template,
  { title, description, path, canonicalPath, jsonLd, robots, headHtml }
) {
  const url = ORIGIN + withSlash(path);
  const canonical = ORIGIN + withSlash(canonicalPath ?? path);
  let html = template;

  if (robots) {
    html = replaceMeta(
      html,
      /<meta name="robots"[^>]*>/,
      `<meta name="robots" content="${esc(robots)}" />`
    );
  }

  html = replaceMeta(html, /<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  html = replaceMeta(
    html,
    /<meta name="description"[^>]*>/,
    `<meta name="description" content="${esc(description)}" />`
  );
  html = replaceMeta(
    html,
    /<link rel="canonical"[^>]*>/,
    `<link rel="canonical" href="${esc(canonical)}" />`
  );
  html = replaceMeta(
    html,
    /<meta property="og:title"[^>]*>/,
    `<meta property="og:title" content="${esc(title)}" />`
  );
  html = replaceMeta(
    html,
    /<meta property="og:description"[^>]*>/,
    `<meta property="og:description" content="${esc(description)}" />`
  );
  html = replaceMeta(
    html,
    /<meta property="og:url"[^>]*>/,
    `<meta property="og:url" content="${esc(url)}" />`
  );
  html = replaceMeta(
    html,
    /<meta name="twitter:title"[^>]*>/,
    `<meta name="twitter:title" content="${esc(title)}" />`
  );
  html = replaceMeta(
    html,
    /<meta name="twitter:description"[^>]*>/,
    `<meta name="twitter:description" content="${esc(description)}" />`
  );

  if (jsonLd) {
    // JSON.stringify は "<" をエスケープしないので、データに "</script>" が
    // 紛れ込むとタグが閉じてしまい、以降が HTML として解釈される。
    // ソースは src/landing/*.json（自分で管理するファイル）だが、将来ここに
    // 検索語などの外部由来データを流し込んでも壊れないように潰しておく。
    const json = JSON.stringify(jsonLd).replaceAll("<", "\\u003c");
    const tag = `<script type="application/ld+json">${json}</script>`;
    html = html.replace("</head>", `${tag}</head>`);
  }

  if (headHtml) html = html.replace("</head>", `${headHtml}</head>`);

  return html;
}

// この日数より古いスナップショットしか無い語は、古い価格を「最安値」として
// 見せ続けないよう noindex にする（収集が止まった場合の安全弁）。
const PRICE_STALE_DAYS = 14;
// インデックス対象にする最低限のデータ量。これ未満は薄いページとして noindex。
const PRICE_MIN_SITES = 3;
const PRICE_MIN_ITEMS = 10;
// 価格推移の表に出す日数。
const PRICE_HISTORY_ROWS = 14;

const yen = (n) => `${Number(n).toLocaleString("ja-JP")}円`;
// "2026-10-18" → "2026年10月18日"（short なら "10月18日"）
function jpDate(iso, short = false) {
  const [y, m, d] = iso.split("-").map(Number);
  return short ? `${m}月${d}日` : `${y}年${m}月${d}日`;
}
function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

// キーワード LP をインデックスさせてよいか（＝中身のあるページか）を決める。
// canonical を持つ重複語は正規ページ側に評価を寄せるので対象外。
function priceState(k) {
  if (k.canonical) return { indexable: false, reason: "canonical" };
  const p = prices.get(k.slug);
  if (!p) return { indexable: false, reason: "no-data" };
  const age = daysBetween(p.date, jstTodayISO());
  if (age > PRICE_STALE_DAYS) return { indexable: false, reason: `stale(${age}d)`, data: p };
  const sites = p.sites.length;
  const items = p.sites.reduce((n, s) => n + s.count, 0);
  if (sites < PRICE_MIN_SITES || items < PRICE_MIN_ITEMS)
    return { indexable: false, reason: `thin(${sites}sites/${items}items)`, data: p };
  return { indexable: true, data: p };
}

function jstTodayISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// スナップショットから要約文を作る（ページごとに固有になる本文）。
// React 側（KeywordLanding）も同じ文をそのまま表示するので、JSON にも入れて渡す。
function priceSummary(p) {
  const out = [];
  const n = p.newSummary;
  const u = p.usedSummary;
  const clip = (t) => (t.length > 40 ? t.slice(0, 40) + "…" : t);
  if (n) {
    out.push(
      `${jpDate(p.date)}時点で、item-search.jp が${p.sites.length}サイトを横断して集めた「${p.term}」の掲載価格のうち、ショップ価格の最安は${n.minLabel}の${yen(n.min)}（${clip(n.minTitle)}）でした。ショップ${n.siteCount}サイト・${n.itemCount}件の価格の中央値は${yen(n.median)}です。`
    );
  }
  if (u) {
    out.push(
      `中古・フリマでは${u.minLabel}の${yen(u.min)}が最安で、中古${u.itemCount}件の中央値は${yen(u.median)}${
        n && u.median < n.median ? `。ショップ価格の中央値より${yen(n.median - u.median)}安い水準です` : ""
      }。`
    );
  }
  // 推移（前回比・期間内の最安）。ショップ最安が取れている日だけで比べる。
  const hist = (p.history || []).filter((h) => h.newMin);
  if (n && hist.length >= 2) {
    const prev = hist.at(-2);
    const diff = n.min - prev.newMin;
    const move =
      diff === 0
        ? "から変わっていません"
        : diff < 0
          ? `から${yen(-diff)}値下がりしました`
          : `から${yen(diff)}値上がりしました`;
    const low = hist.reduce((a, b) => (b.newMin < a.newMin ? b : a));
    out.push(
      `前回（${jpDate(prev.date, true)}）のショップ最安${yen(prev.newMin)}${move}。記録している${hist.length}日間の最安は${jpDate(low.date, true)}の${yen(low.newMin)}です。`
    );
  }
  return out;
}

// 価格推移の簡易グラフ（インライン SVG）。数値と日付だけから作るので外部由来の
// 文字列は入らない。2 日分以上ないと線にならないので null を返す。
function priceChartSvg(p) {
  const hist = (p.history || []).slice(-60);
  const series = [
    { key: "newMin", color: "#2563eb", label: "ショップ最安" },
    { key: "usedMin", color: "#9ca3af", label: "中古・フリマ最安", dash: "5 4" },
  ].filter((s) => hist.filter((h) => h[s.key]).length >= 2);
  if (series.length === 0) return null;
  const W = 640, H = 180, L = 64, R = 12, T = 14, B = 34;
  const vals = series.flatMap((s) => hist.map((h) => h[s.key]).filter(Boolean));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { lo *= 0.95; hi *= 1.05; }
  const x = (i) => L + (hist.length === 1 ? 0 : (i * (W - L - R)) / (hist.length - 1));
  const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo);
  const lines = series
    .map((s) => {
      const pts = hist
        .map((h, i) => (h[s.key] ? `${x(i).toFixed(1)},${y(h[s.key]).toFixed(1)}` : null))
        .filter(Boolean)
        .join(" ");
      return `<polyline fill="none" stroke="${s.color}" stroke-width="2.5"${
        s.dash ? ` stroke-dasharray="${s.dash}"` : ""
      } points="${pts}"/>`;
    })
    .join("");
  const legend = series
    .map(
      (s, i) =>
        `<g transform="translate(${L + i * 150},${H - 8})"><line x1="0" y1="-4" x2="18" y2="-4" stroke="${s.color}" stroke-width="2.5"${
          s.dash ? ` stroke-dasharray="${s.dash}"` : ""
        }/><text x="24" y="0">${s.label}</text></g>`
    )
    .join("");
  const axis = [hi, lo]
    .map((v) => `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${yen(Math.round(v))}</text>`)
    .join("");
  const dates = `<text x="${L}" y="${H - B + 16}">${jpDate(hist[0].date, true)}</text><text x="${W - R}" y="${H - B + 16}" text-anchor="end">${jpDate(hist.at(-1).date, true)}</text>`;
  return `<svg class="pr-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="「${esc(p.term)}」の最安値の推移" font-size="11" fill="#6b7280"><line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="#e5e7eb"/>${axis}${dates}${lines}${legend}</svg>`;
}

// 価格推移の表（新しい順に最大 PRICE_HISTORY_ROWS 日）。
function priceHistoryRows(p) {
  return (p.history || []).slice(-PRICE_HISTORY_ROWS).reverse();
}

const PRICE_NOTE =
  "価格は item-search.jp が各ショップの検索結果から毎日自動で取得した時点の税込表示価格で、送料・ポイントは含みません。本体以外の付属品や関連商品はできるだけ除外して集計しています。最新の価格・在庫は必ずリンク先でご確認ください。";

// React 側（KeywordLanding）に渡す価格データ。要約文とグラフもビルド時に作って渡し、
// 表示ロジックを二重に持たないようにする。
function pricePayload(k, st, description) {
  const p = st.data;
  return {
    ...p,
    indexable: st.indexable,
    description,
    summary: priceSummary(p),
    chartSvg: priceChartSvg(p),
    recent: priceHistoryRows(p),
    note: PRICE_NOTE,
  };
}

function keywordJsonLd(k, st) {
  const url = `${ORIGIN}/s/${k.slug}/`;
  const cat = categories.find((c) => c.slug === k.category);
  const crumbs = [
    { "@type": "ListItem", position: 1, name: "ホーム", item: `${ORIGIN}/` },
  ];
  if (cat)
    crumbs.push({
      "@type": "ListItem",
      position: 2,
      name: cat.name,
      item: `${ORIGIN}/c/${cat.slug}/`,
    });
  crumbs.push({
    "@type": "ListItem",
    position: crumbs.length + 1,
    name: k.term,
    item: url,
  });
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: k.title,
    url,
    description: k.description,
    inLanguage: "ja",
    ...(st.data ? { dateModified: st.data.date } : {}),
    isPartOf: { "@type": "WebSite", name: "item-search.jp", url: `${ORIGIN}/` },
    breadcrumb: { "@type": "BreadcrumbList", itemListElement: crumbs },
  };
}

function landingJsonLd(c) {
  const url = `${ORIGIN}/c/${c.slug}/`;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: c.title,
    url,
    description: c.description,
    inLanguage: "ja",
    isPartOf: { "@type": "WebSite", name: "item-search.jp", url: `${ORIGIN}/` },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "ホーム", item: `${ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: c.name, item: url },
      ],
    },
  };
}

// カテゴリ別ページをインデックス対象にする最小シード件数。これ未満は
// noindex,follow で静的化し sitemap からも外す（薄いページの量産を避ける）。
// 静的化自体はする: 404.html を置くと SPA フォールバックが効かなくなるため、
// 生成しないと直リンクが 404 になる。src/landing/index.ts の RANK_SEED_MIN と揃える。
const RANK_SEED_MIN = 2;

// ランキング項目のリンク先（キーワード LP があれば内部リンク優先）。
function rankingHref(item) {
  if (item.slug && keywords.some((k) => k.slug === item.slug))
    return `/s/${item.slug}/`;
  return `/?q=${encodeURIComponent(item.term)}`;
}

// 静的シード（ranking.json）を指定カテゴリで絞り、順位を振り直す。"all" は全件。
function seedItemsFor(category) {
  if (category === "all") return ranking.items;
  return ranking.items
    .filter((i) => i.category === category)
    .map((i, idx) => ({ ...i, rank: idx + 1 }));
}

function rankingLabel(category) {
  const c = (ranking.categories || []).find((x) => x.slug === category);
  return c ? c.label : category;
}

// ランキングは ItemList 構造化データで表現する（リッチリザルト対象）。
function rankingJsonLd(category) {
  const isAll = category === "all";
  const label = rankingLabel(category);
  const path = isAll ? "/ranking" : `/ranking/${category}`;
  const items = seedItemsFor(category);
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: isAll
      ? `人気検索キーワードランキング【${RANKING_PERIOD}】`
      : `${label}の検索数ランキング`,
    description: isAll ? ranking.intro : `${label}の人気検索キーワードランキング`,
    url: ORIGIN + withSlash(path),
    inLanguage: "ja",
    numberOfItems: items.length,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    isPartOf: { "@type": "WebSite", name: "item-search.jp", url: `${ORIGIN}/` },
    itemListElement: items.map((item) => ({
      "@type": "ListItem",
      position: item.rank,
      name: item.term,
      url: ORIGIN + withSlash(rankingHref(item)),
    })),
  };
}
// --- 生成 -----------------------------------------------------------------
const template = await readFile(join(DIST, "index.html"), "utf8");
const written = [];

// カテゴリ LP
for (const c of categories) {
  const outDir = join(DIST, "c", c.slug);
  await mkdir(outDir, { recursive: true });
  const html = render(template, {
    title: c.title,
    description: c.description,
    path: `/c/${c.slug}`,
    jsonLd: landingJsonLd(c),
  });
  await writeFile(join(outDir, "index.html"), html, "utf8");
  written.push(`/c/${c.slug}`);
}

// キーワード LP
// 価格データが十分に無い語は noindex,follow にして sitemap から外す（priceState）。
// canonical を持つ重複語は正規ページを canonical に指定し、sitemap から外す。
const indexedKeywords = []; // sitemap 用
const keywordStates = [];
await mkdir(join(DIST, "data", "prices"), { recursive: true });
for (const k of keywords) {
  const st = priceState(k);
  keywordStates.push(`${k.slug}:${st.indexable ? "index" : st.reason}`);
  const outDir = join(DIST, "s", k.slug);
  await mkdir(outDir, { recursive: true });

  // 価格データは静的 JSON（SPA 遷移時に React が fetch）と、ページ内の埋め込み
  // （#root の外の <head>。React が描画を差し替えても消えない）の 2 か所に出す。
  let headHtml;
  let description = k.description;
  if (st.data) {
    // 説明文の先頭に当日の最安値を入れる（検索結果のスニペットで目を引くように）。
    const n = st.data.newSummary;
    if (n) description = `【${jpDate(st.data.date, true)}時点 最安${yen(n.min)}】${k.description}`;
    const json = JSON.stringify(pricePayload(k, st, description)).replaceAll("<", "\\u003c");
    await writeFile(join(DIST, "data", "prices", `${k.slug}.json`), json, "utf8");
    headHtml = `<script type="application/json" id="price-data">${json}</script>`;
  }

  const html = render(template, {
    title: k.title,
    description,
    path: `/s/${k.slug}`,
    canonicalPath: k.canonical ? `/s/${k.canonical}` : undefined,
    jsonLd: keywordJsonLd(k, st),
    robots: st.indexable || k.canonical ? undefined : "noindex, follow",
    headHtml,
  });
  await writeFile(join(outDir, "index.html"), html, "utf8");
  written.push(`/s/${k.slug}`);
  if (st.indexable) indexedKeywords.push({ k, lastmod: st.data.date });
}

// 人気検索キーワードランキング LP（/ranking = 総合, /ranking/<category> = カテゴリ別）
// カテゴリ別はシードが RANK_SEED_MIN 件未満なら noindex にし、sitemap に載せない。
const rankingPaths = []; // sitemap 用に生成したパスを控える
{
  // 総合
  const outDir = join(DIST, "ranking");
  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, "index.html"),
    render(template, {
      title: `人気検索キーワードランキング【${RANKING_PERIOD}】 | item-search.jp`,
      description:
        "楽天・Yahoo!ショッピング・メルカリ・ヤフオク・ヨドバシを横断検索できる item-search.jp で、いま最も検索されている商品キーワードのランキング。各キーワードから複数サイトの最安値比較に進めます。",
      path: "/ranking",
      jsonLd: rankingJsonLd("all"),
    }),
    "utf8"
  );
  written.push("/ranking");
  rankingPaths.push("/ranking");

  // カテゴリ別
  for (const c of ranking.categories || []) {
    if (c.slug === "all") continue;
    const thin = seedItemsFor(c.slug).length < RANK_SEED_MIN;
    const dir = join(DIST, "ranking", c.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "index.html"),
      render(template, {
        title: `${c.label}の検索数ランキング | item-search.jp 商品横断検索`,
        description: `item-search.jp で検索されている「${c.label}」の人気商品キーワードを検索数順にランキング。各キーワードから複数の通販サイトを横断して最安値を比較できます。`,
        path: `/ranking/${c.slug}`,
        jsonLd: thin ? undefined : rankingJsonLd(c.slug),
        robots: thin ? "noindex, follow" : undefined,
      }),
      "utf8"
    );
    if (thin) continue;
    written.push(`/ranking/${c.slug}`);
    rankingPaths.push(`/ranking/${c.slug}`);
  }
}

// /about, /terms, /privacy
for (const p of STATIC_PAGES) {
  const outDir = join(DIST, p.path.slice(1));
  await mkdir(outDir, { recursive: true });
  const html = render(template, {
    title: p.title,
    description: p.description,
    path: p.path,
    jsonLd: staticPageJsonLd(p),
  });
  await writeFile(join(outDir, "index.html"), html, "utf8");
  written.push(p.path);
}

// 404.html。Cloudflare Pages はこれがあると未知パスに HTTP 404 で返す
// （無いと SPA とみなして index.html を 200 で返し、ソフト404になる）。
// 本文は JS 起動後に Root.tsx の NotFound が描画する。
await writeFile(
  join(DIST, "404.html"),
  render(template, {
    title: "ページが見つかりません | item-search.jp",
    description: HOME.description,
    path: "/",
    robots: "noindex, follow",
  })
    // 未知パスの URL を canonical / og:url として名乗らせない（404 は正規 URL を持たない）。
    .replace(/<link rel="canonical"[^>]*>\n?/, "")
    .replace(/<meta property="og:url"[^>]*>\n?/, ""),
  "utf8"
);

// トップ（/）。template は先頭で読み込み済みなので、上書きしても他ページに影響しない。
await writeFile(
  join(DIST, "index.html"),
  render(template, {
    title: HOME.title,
    description: HOME.description,
    path: "/",
  }),
  "utf8"
);
written.push("/");

// sitemap.xml を再生成
const urls = [
  {
    loc: `${ORIGIN}/`,
    // トップは3つの情報源すべてを埋め込んでいるので、最も新しい更新日を採る。
    lastmod: [HOME_UPDATED, updated, kwUpdated, ranking.updated].sort().at(-1),
    changefreq: "weekly",
    priority: "1.0",
  },
  ...rankingPaths.map((p) => ({
    loc: ORIGIN + withSlash(p),
    changefreq: p === "/ranking" ? "daily" : "weekly",
    priority: p === "/ranking" ? "0.9" : "0.8",
    lastmod: ranking.updated,
  })),
  ...categories.map((c) => ({
    loc: `${ORIGIN}/c/${c.slug}/`,
    changefreq: "weekly",
    priority: "0.8",
    lastmod: updated,
  })),
  ...indexedKeywords.map(({ k, lastmod }) => ({
    loc: `${ORIGIN}/s/${k.slug}/`,
    changefreq: "daily",
    priority: "0.7",
    // 価格は毎日変わるので、文言の更新日（kwUpdated）より新しい方を採る。
    lastmod: [kwUpdated, lastmod].sort().at(-1),
  })),
  ...STATIC_PAGES.map((p) => ({
    loc: ORIGIN + withSlash(p.path),
    lastmod: p.updated,
    changefreq: p.changefreq,
    priority: p.priority,
  })),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url>\n    <loc>${u.loc}</loc>${
        u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ""
      }\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
  )
  .join("\n")}
</urlset>
`;
await writeFile(join(DIST, "sitemap.xml"), sitemap, "utf8");

console.log(
  `prerender: home + ${categories.length} category LP + ${keywords.length} keyword LP + ${rankingPaths.length} ranking LP + ${STATIC_PAGES.length} static pages, sitemap with ${urls.length} URLs`
);
console.log("  " + written.join("  "));
console.log(
  `prerender: keyword LP index ${indexedKeywords.length}/${keywords.length}  ` +
    keywordStates.filter((s) => !s.endsWith(":index")).join("  ")
);
