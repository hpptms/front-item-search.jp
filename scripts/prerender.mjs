// ビルド後プリレンダ。dist/index.html をテンプレートに、
//   - カテゴリ LP（/c/<slug>）: 固有 <head> ＋ クローラー向け静的本文を焼き込む
//   - /about, /terms: 固有 <head>（本文は JS 描画）を焼き込む
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

// sitemap.xml を再生成
const urls = [
  { loc: `${ORIGIN}/`, changefreq: "weekly", priority: "1.0" },
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
  `prerender: ${categories.length} category LP + ${keywords.length} keyword LP + ${STATIC_PAGES.length} static pages, sitemap with ${urls.length} URLs`
);
console.log("  " + written.join("  "));
