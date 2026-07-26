// ルートごとの <title> / meta description / canonical / OGP を切り替える。
// CSR なので index.html の <head> は1種類しか無い。ページ遷移のたびにこの関数で
// document 側を書き換え、SNS プレビューや検索結果に出るタイトルをページに合わせる。
//
// ビルド時にプリレンダされる静的ページ（トップ・/about・/terms・/c/*）は
// scripts/prerender.mjs が同じ内容で <head> を焼き込むため、JS 無効のクローラーにも届く。
// ここでの書き換えは JS 実行後（SPA 遷移時）の補正が主目的。

const SITE = "item-search.jp";
const ORIGIN = "https://item-search.jp";
const DEFAULT_OGP = `${ORIGIN}/ogp.png`;

const DEFAULT_ROBOTS = "index, follow, max-image-preview:large";

export type SeoMeta = {
  title: string;
  description: string;
  /** ORIGIN からの絶対パス。省略時は現在の pathname を使う。 */
  path?: string;
  /** robots メタの値。省略時は index,follow。検索結果など薄いページは noindex にする。 */
  robots?: string;
};

// 固定ルートのメタ情報。動的な /c/<slug> は Landing 側から applySeo() を直接呼ぶ。
export const ROUTE_SEO: Record<string, SeoMeta> = {
  "/": {
    title: "商品横断検索 | Amazon・楽天・メルカリを一括比較 - item-search.jp",
    description:
      "Amazon・楽天市場・Yahoo!ショッピング・メルカリ・ヤフオク・ヨドバシ・ビックカメラを横断して一括検索。サイトをまたいで価格を比較し、ほしい商品の最安値を見つけられる無料の通販横断検索サービスです。",
    path: "/",
  },
  "/about": {
    title: "サイトの説明・使い方 | item-search.jp 商品横断検索",
    description:
      "item-search.jp は複数の通販サイトを横断して商品を一括検索できるサービスです。対応ショップ・使い方・よくある質問をまとめています。",
    path: "/about",
  },
  "/terms": {
    title: "利用規約 | item-search.jp 商品横断検索",
    description:
      "item-search.jp（商品横断検索サービス）の利用規約です。サービスの内容、価格情報の扱い、アフィリエイト、免責事項などを定めています。",
    path: "/terms",
  },
  "/privacy": {
    title: "プライバシーポリシー・運営者情報 | item-search.jp",
    description:
      "item-search.jp のプライバシーポリシーです。Googleアナリティクスやアフィリエイト Cookie の利用、検索履歴の扱い、運営者情報・お問い合わせ先を記載しています。",
    path: "/privacy",
  },
};

function setMeta(selector: string, attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

// 与えられたメタ情報を document.head に反映する。
export function applySeo(meta: SeoMeta) {
  const path = meta.path ?? window.location.pathname;
  const url = ORIGIN + path;
  const ogImage = DEFAULT_OGP;

  document.title = meta.title;
  setMeta('meta[name="description"]', "name", "description", meta.description);
  setMeta('meta[name="robots"]', "name", "robots", meta.robots ?? DEFAULT_ROBOTS);
  setLink("canonical", url);

  setMeta('meta[property="og:title"]', "property", "og:title", meta.title);
  setMeta('meta[property="og:description"]', "property", "og:description", meta.description);
  setMeta('meta[property="og:url"]', "property", "og:url", url);
  setMeta('meta[property="og:image"]', "property", "og:image", ogImage);
  setMeta('meta[property="og:site_name"]', "property", "og:site_name", SITE);

  setMeta('meta[name="twitter:title"]', "name", "twitter:title", meta.title);
  setMeta('meta[name="twitter:description"]', "name", "twitter:description", meta.description);
  setMeta('meta[name="twitter:image"]', "name", "twitter:image", ogImage);
}

// pathname から固定ルートのメタを引く（無ければトップを既定にする）。
export function seoForPath(pathname: string): SeoMeta {
  return ROUTE_SEO[pathname] ?? ROUTE_SEO["/"];
}

// 検索結果表示中（/?q=... で来た場合）のメタ。
// ?q= の生結果は無数に生成される薄いページなので noindex,follow にし、
// canonical はクリーンなトップ（/）に集約してインデックスの分散を防ぐ。
export function applySearchSeo(term: string) {
  applySeo({
    title: `「${term}」の検索結果 | item-search.jp 商品横断検索`,
    description: ROUTE_SEO["/"].description,
    path: "/", // canonical はトップに集約
    robots: "noindex, follow",
  });
}
