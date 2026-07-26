// ビルド後プリレンダ。dist/index.html をテンプレートに、
//   - トップ（/）: 固有 <head> ＋ クローラー向け静的本文（主要ページへのハブ）
//   - カテゴリ LP（/c/<slug>）/ キーワード LP（/s/<slug>）: 固有 <head> ＋ クローラー向け静的本文
//   - ランキング LP（/ranking）: 固有 <head> ＋ 静的本文 ＋ ItemList 構造化データ
//   - /about, /terms, /privacy: 固有 <head>（本文は JS 描画）を焼き込む
//   - sitemap.xml: 全 URL を再生成
// を出力する。CSR のままでは空 HTML になる問題を、静的スナップショットで補う。
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

// トップ（/）の <head>（src/seo.ts の ROUTE_SEO["/"] と内容を合わせる）。
const HOME = {
  title: "商品横断検索 | Amazon・楽天・メルカリを一括比較 - item-search.jp",
  description:
    "Amazon・楽天市場・Yahoo!ショッピング・メルカリ・ヤフオク・ヨドバシ・ビックカメラを横断して一括検索。サイトをまたいで価格を比較し、ほしい商品の最安値を見つけられる無料の通販横断検索サービスです。",
};

// 対応ショップ（src/pages/About.tsx の一覧と揃える）。
const SHOPS = [
  "Amazon",
  "楽天市場",
  "Yahoo!ショッピング",
  "メルカリ",
  "Yahoo!オークション",
  "ヨドバシ.com",
  "ビックカメラ",
];

// トップに載せる人気キーワードの件数（多すぎると JS 描画までの一瞬の表示が重くなる）。
const HOME_RANKING_MAX = 10;

// /about, /terms, /privacy の <head>（src/seo.ts の ROUTE_SEO と内容を合わせる）。
const STATIC_PAGES = [
  {
    path: "/about",
    title: "サイトの説明・使い方 | item-search.jp 商品横断検索",
    description:
      "item-search.jp は複数の通販サイトを横断して商品を一括検索できるサービスです。対応ショップ・使い方・よくある質問をまとめています。",
    changefreq: "monthly",
    priority: "0.5",
  },
  {
    path: "/terms",
    title: "利用規約 | item-search.jp 商品横断検索",
    description:
      "item-search.jp（商品横断検索サービス）の利用規約です。サービスの内容、価格情報の扱い、アフィリエイト、免責事項などを定めています。",
    changefreq: "yearly",
    priority: "0.3",
  },
  {
    path: "/privacy",
    title: "プライバシーポリシー・運営者情報 | item-search.jp",
    description:
      "item-search.jp のプライバシーポリシーです。Googleアナリティクスやアフィリエイト Cookie の利用、検索履歴の扱い、運営者情報・お問い合わせ先を記載しています。",
    changefreq: "yearly",
    priority: "0.3",
  },
];

// --- ユーティリティ -------------------------------------------------------
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
// OGP に置換する。bodyHtml が渡されたら #root に静的本文を差し込む。
function render(template, { title, description, path, jsonLd, bodyHtml }) {
  const url = ORIGIN + path;
  let html = template;

  html = replaceMeta(html, /<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  html = replaceMeta(
    html,
    /<meta name="description"[^>]*>/,
    `<meta name="description" content="${esc(description)}" />`
  );
  html = replaceMeta(
    html,
    /<link rel="canonical"[^>]*>/,
    `<link rel="canonical" href="${esc(url)}" />`
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
    const tag = `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
    html = html.replace("</head>", `${tag}</head>`);
  }

  if (bodyHtml) {
    // Vite ビルド後の #root は空。ここにクローラー向けの静的本文を差し込む。
    // JS 実行後は createRoot が中身を置き換えるため、利用者の見た目は変わらない。
    html = html.replace('<div id="root"></div>', `<div id="root">${bodyHtml}</div>`);
  }

  return html;
}

// カテゴリ LP のクローラー向け静的本文（意味のある HTML とリンク）。
function landingBody(c) {
  const kw = c.keywords
    .map(
      (k) =>
        `<li><a href="/?q=${encodeURIComponent(k)}">${esc(k)}の価格を比較</a></li>`
    )
    .join("");
  const others = categories
    .filter((o) => o.slug !== c.slug)
    .map((o) => `<li><a href="/c/${o.slug}">${esc(o.name)}の価格を比較</a></li>`)
    .join("");
  const kwPages = keywords
    .filter((k) => k.category === c.slug)
    .map((k) => `<li><a href="/s/${k.slug}">${esc(k.term)}の最安値・価格比較</a></li>`)
    .join("");
  const paras = c.body.map((p) => `<p>${esc(p)}</p>`).join("");
  return `<main>
<nav aria-label="パンくず"><a href="/">ホーム</a> &gt; ${esc(c.name)}</nav>
<h1>${esc(c.name)}の価格を横断比較</h1>
<p>${esc(c.lead)}</p>
${paras}
<p><a href="/">横断検索をはじめる</a></p>
<h2>人気のキーワード</h2>
<ul>${kw}</ul>
${kwPages ? `<h2>人気の商品から探す</h2>\n<ul>${kwPages}</ul>` : ""}
<h2>他のカテゴリから探す</h2>
<ul>${others}</ul>
<p>item-search.jp の使い方は<a href="/about">サイトの説明</a>をご覧ください。</p>
</main>`;
}

// キーワード LP のクローラー向け静的本文。
function keywordBody(k) {
  const related = k.related
    .map(
      (r) =>
        `<li><a href="/?q=${encodeURIComponent(r)}">${esc(r)}の価格を比較</a></li>`
    )
    .join("");
  const cat = categories.find((c) => c.slug === k.category);
  const paras = k.body.map((p) => `<p>${esc(p)}</p>`).join("");
  return `<main>
<nav aria-label="パンくず"><a href="/">ホーム</a>${
    cat ? ` &gt; <a href="/c/${cat.slug}">${esc(cat.name)}</a>` : ""
  } &gt; ${esc(k.term)}</nav>
<h1>${esc(k.term)}の最安値・価格比較</h1>
<p>${esc(k.lead)}</p>
${paras}
<p><a href="/?q=${encodeURIComponent(k.term)}">「${esc(k.term)}」を横断検索する</a></p>
<h2>関連キーワード</h2>
<ul>${related}</ul>
${cat ? `<p>関連カテゴリ: <a href="/c/${cat.slug}">${esc(cat.name)}の価格を比較</a></p>` : ""}
</main>`;
}

function keywordJsonLd(k) {
  const url = `${ORIGIN}/s/${k.slug}`;
  const cat = categories.find((c) => c.slug === k.category);
  const crumbs = [
    { "@type": "ListItem", position: 1, name: "ホーム", item: `${ORIGIN}/` },
  ];
  if (cat)
    crumbs.push({
      "@type": "ListItem",
      position: 2,
      name: cat.name,
      item: `${ORIGIN}/c/${cat.slug}`,
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
    isPartOf: { "@type": "WebSite", name: "item-search.jp", url: `${ORIGIN}/` },
    breadcrumb: { "@type": "BreadcrumbList", itemListElement: crumbs },
  };
}

function landingJsonLd(c) {
  const url = `${ORIGIN}/c/${c.slug}`;
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

// カテゴリ別ページを静的化する最小シード件数。これ未満はプリレンダ/sitemap から
// 除外し、ライブ集計がたまってから露出させる（薄いページの量産を避ける）。
const RANK_SEED_MIN = 2;

// ランキング項目のリンク先（キーワード LP があれば内部リンク優先）。
function rankingHref(item) {
  if (item.slug && keywords.some((k) => k.slug === item.slug))
    return `/s/${item.slug}`;
  return `/?q=${encodeURIComponent(item.term)}`;
}

const TREND_MARK = { up: "▲", down: "▼", new: "NEW", same: "―" };

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

// ランキングのクローラー向け静的本文（意味のある HTML とリンク）。
function rankingBody(category) {
  const label = rankingLabel(category);
  const rows = seedItemsFor(category)
    .map((item) => {
      const cat = categories.find((c) => c.slug === item.category);
      const mark = TREND_MARK[item.trend] || "";
      const count =
        typeof item.count === "number"
          ? ` <span>${item.count.toLocaleString("ja-JP")}回検索</span>`
          : "";
      return `<li><strong>${item.rank}位</strong> <a href="${rankingHref(
        item
      )}">${esc(item.term)}</a>${count}${mark ? ` <span>${mark}</span>` : ""}${
        cat ? ` <a href="/c/${cat.slug}">${esc(cat.name)}</a>` : ""
      }${item.note ? `<br>${esc(item.note)}` : ""}</li>`;
    })
    .join("");
  const catLinks = (ranking.categories || [])
    .filter((c) => c.slug !== "all")
    .map(
      (c) =>
        `<li><a href="/ranking/${c.slug}">${esc(c.label)}の検索数ランキング</a></li>`
    )
    .join("");
  const priceLinks = categories
    .map((c) => `<li><a href="/c/${c.slug}">${esc(c.name)}の価格を比較</a></li>`)
    .join("");
  const isAll = category === "all";
  const heading = isAll
    ? `人気検索キーワードランキング【${esc(ranking.period)}】`
    : `${esc(label)}の検索数ランキング`;
  const intro = isAll
    ? esc(ranking.intro)
    : `item-search.jp で横断検索されている「${esc(
        label
      )}」の人気キーワードを、検索数の多い順にランキングしました。`;
  const crumb = isAll
    ? "人気検索キーワードランキング"
    : `<a href="/ranking">人気検索キーワードランキング</a> &gt; ${esc(label)}`;
  return `<main>
<nav aria-label="パンくず"><a href="/">ホーム</a> &gt; ${crumb}</nav>
<h1>${heading}</h1>
<p>${intro}</p>
<p>${esc(ranking.source)}</p>
<ol>${rows}</ol>
<h2>カテゴリ別ランキング</h2>
<ul>${catLinks}</ul>
<h2>カテゴリ別に価格を比較する</h2>
<ul>${priceLinks}</ul>
<p>item-search.jp の使い方は<a href="/about">サイトの説明</a>をご覧ください。</p>
</main>`;
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
      ? `人気検索キーワードランキング【${ranking.period}】`
      : `${label}の検索数ランキング`,
    description: isAll ? ranking.intro : `${label}の人気検索キーワードランキング`,
    url: ORIGIN + path,
    inLanguage: "ja",
    numberOfItems: items.length,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    isPartOf: { "@type": "WebSite", name: "item-search.jp", url: `${ORIGIN}/` },
    itemListElement: items.map((item) => ({
      "@type": "ListItem",
      position: item.rank,
      name: item.term,
      url: ORIGIN + rankingHref(item),
    })),
  };
}

// トップ（/）のクローラー向け静的本文。
// 検索 UI は JS でしか描けないので、代わりに「何のサイトか」と主要ページへの
// 内部リンク（ハブ）を静的 HTML で置く。JS 起動後は createRoot が置き換える。
function homeBody() {
  const shops = SHOPS.map((s) => `<li>${esc(s)}</li>`).join("");
  const ranks = ranking.items
    .slice(0, HOME_RANKING_MAX)
    .map(
      (item) =>
        `<li><strong>${item.rank}位</strong> <a href="${rankingHref(item)}">${esc(
          item.term
        )}</a>の最安値を比較</li>`
    )
    .join("");
  const cats = categories
    .map((c) => `<li><a href="/c/${c.slug}">${esc(c.name)}の価格を比較</a></li>`)
    .join("");
  const kws = keywords
    .map((k) => `<li><a href="/s/${k.slug}">${esc(k.term)}の最安値・価格比較</a></li>`)
    .join("");
  return `<main>
<h1>商品横断検索 — 複数の通販サイトをまとめて一括検索</h1>
<p>item-search.jp は Amazon・楽天市場・Yahoo!ショッピング・メルカリ・ヤフオク・ヨドバシ・ビックカメラなど、複数のオンラインショップを横断して商品を一括検索できる無料のサービスです。ほしい商品の価格をサイトをまたいで比較し、最安値を見つけられます。</p>
<p>キーワードを入力すると、対応する各ショップの検索結果を1画面にまとめて表示します。会員登録は不要です。</p>
<h2>対応しているオンラインショップ</h2>
<ul>${shops}</ul>
<h2>いま人気の検索キーワード</h2>
<ol>${ranks}</ol>
<p><a href="/ranking">人気検索キーワードランキング【${esc(
    ranking.period
  )}】をすべて見る</a></p>
<h2>ジャンルから探す</h2>
<ul>${cats}</ul>
<h2>人気の商品から探す</h2>
<ul>${kws}</ul>
<p>使い方や対応ショップの詳細は<a href="/about">サイトの説明</a>を、取り扱いについては<a href="/terms">利用規約</a>・<a href="/privacy">プライバシーポリシー</a>をご覧ください。</p>
</main>`;
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
    bodyHtml: landingBody(c),
  });
  await writeFile(join(outDir, "index.html"), html, "utf8");
  written.push(`/c/${c.slug}`);
}

// キーワード LP
for (const k of keywords) {
  const outDir = join(DIST, "s", k.slug);
  await mkdir(outDir, { recursive: true });
  const html = render(template, {
    title: k.title,
    description: k.description,
    path: `/s/${k.slug}`,
    jsonLd: keywordJsonLd(k),
    bodyHtml: keywordBody(k),
  });
  await writeFile(join(outDir, "index.html"), html, "utf8");
  written.push(`/s/${k.slug}`);
}

// 人気検索キーワードランキング LP（/ranking = 総合, /ranking/<category> = カテゴリ別）
// カテゴリ別はシードが RANK_SEED_MIN 件以上あるものだけ静的化する。
const rankingPaths = []; // sitemap 用に生成したパスを控える
{
  // 総合
  const outDir = join(DIST, "ranking");
  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, "index.html"),
    render(template, {
      title: `人気検索キーワードランキング【${ranking.period}】 | item-search.jp`,
      description:
        "Amazon・楽天・Yahoo!ショッピング・メルカリ・ヤフオク・ヨドバシを横断検索できる item-search.jp で、いま最も検索されている商品キーワードのランキング。各キーワードから複数サイトの最安値比較に進めます。",
      path: "/ranking",
      jsonLd: rankingJsonLd("all"),
      bodyHtml: rankingBody("all"),
    }),
    "utf8"
  );
  written.push("/ranking");
  rankingPaths.push("/ranking");

  // カテゴリ別
  for (const c of ranking.categories || []) {
    if (c.slug === "all") continue;
    if (seedItemsFor(c.slug).length < RANK_SEED_MIN) continue;
    const dir = join(DIST, "ranking", c.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "index.html"),
      render(template, {
        title: `${c.label}の検索数ランキング | item-search.jp 商品横断検索`,
        description: `item-search.jp で検索されている「${c.label}」の人気商品キーワードを検索数順にランキング。各キーワードから複数の通販サイトを横断して最安値を比較できます。`,
        path: `/ranking/${c.slug}`,
        jsonLd: rankingJsonLd(c.slug),
        bodyHtml: rankingBody(c.slug),
      }),
      "utf8"
    );
    written.push(`/ranking/${c.slug}`);
    rankingPaths.push(`/ranking/${c.slug}`);
  }
}

// /about, /terms, /privacy（head のみ）
for (const p of STATIC_PAGES) {
  const outDir = join(DIST, p.path.slice(1));
  await mkdir(outDir, { recursive: true });
  const html = render(template, {
    title: p.title,
    description: p.description,
    path: p.path,
  });
  await writeFile(join(outDir, "index.html"), html, "utf8");
  written.push(p.path);
}

// トップ（/）。template は先頭で読み込み済みなので、上書きしても他ページに影響しない。
// SPA フォールバック（_redirects）で未知パスにも返るため、canonical は / 固定のまま。
await writeFile(
  join(DIST, "index.html"),
  render(template, {
    title: HOME.title,
    description: HOME.description,
    path: "/",
    bodyHtml: homeBody(),
  }),
  "utf8"
);
written.push("/");

// sitemap.xml を再生成
const urls = [
  { loc: `${ORIGIN}/`, changefreq: "weekly", priority: "1.0" },
  ...rankingPaths.map((p) => ({
    loc: ORIGIN + p,
    changefreq: p === "/ranking" ? "daily" : "weekly",
    priority: p === "/ranking" ? "0.9" : "0.8",
    lastmod: ranking.updated,
  })),
  ...categories.map((c) => ({
    loc: `${ORIGIN}/c/${c.slug}`,
    changefreq: "weekly",
    priority: "0.8",
    lastmod: updated,
  })),
  ...keywords.map((k) => ({
    loc: `${ORIGIN}/s/${k.slug}`,
    changefreq: "weekly",
    priority: "0.7",
    lastmod: kwUpdated,
  })),
  ...STATIC_PAGES.map((p) => ({
    loc: ORIGIN + p.path,
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
