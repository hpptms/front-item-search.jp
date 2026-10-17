import { useEffect, useReducer, type ComponentType } from "react";
import { usePathname } from "./router";
import { applySeo, seoForPath } from "./seo";
import {
  categoryBySlug,
  landingSlug,
  keywordBySlug,
  keywordSlug,
  isRankingPath,
  rankingCategorySlug,
} from "./landing";

// ページごとにチャンクを分け、そのページが使う部品だけを読み込む（検索 UI の Drawer、
// ランキングのコメント欄の TextField などを他ページに載せない）。
const PAGES = {
  app: () => import("./App"),
  about: () => import("./pages/About"),
  terms: () => import("./pages/Terms"),
  privacy: () => import("./pages/Privacy"),
  landing: () => import("./pages/Landing"),
  keyword: () => import("./pages/KeywordLanding"),
  ranking: () => import("./pages/Ranking"),
  notFound: () => import("./pages/NotFound"),
};
type PageKey = keyof typeof PAGES;

const loaded: Partial<Record<PageKey, ComponentType<any>>> = {};

function loadPage(key: PageKey) {
  return PAGES[key]().then((m) => {
    loaded[key] = m.default;
  });
}

function pageKeyFor(pathname: string): PageKey {
  const catSlug = landingSlug(pathname);
  if (catSlug && categoryBySlug(catSlug)) return "landing";
  const kwSlug = keywordSlug(pathname);
  if (kwSlug && keywordBySlug(kwSlug)) return "keyword";
  if (isRankingPath(pathname) || rankingCategorySlug(pathname) !== null) return "ranking";
  switch (pathname) {
    case "/about":
      return "about";
    case "/terms":
      return "terms";
    case "/privacy":
      return "privacy";
    case "/":
      return "app";
    default:
      // 未知の /c/<slug> を含む未知パス。Pages は dist/404.html を HTTP 404 で返し、
      // JS 起動後はこちらが同じ内容を描画する。
      return "notFound";
  }
}

// 初回描画の前に現在ページのチャンクを読み込んでおく（main.tsx が await する）。
// 読み込み前に描画するとプリレンダー済みの HTML が一瞬消えるため。
export function preloadCurrentPage() {
  return loadPage(pageKeyFor(window.location.pathname));
}

// pathname に応じてトップ（検索UI）／静的ページ／カテゴリ LP／キーワード LP を描画する。
export default function Root() {
  const pathname = usePathname();
  const catSlug = landingSlug(pathname);
  const category = catSlug ? categoryBySlug(catSlug) : undefined;
  const kwSlug = keywordSlug(pathname);
  const keyword = kwSlug ? keywordBySlug(kwSlug) : undefined;
  const rankingCat = rankingCategorySlug(pathname);
  const ranking = isRankingPath(pathname) || rankingCat !== null;
  const key = pageKeyFor(pathname);
  const Page = loaded[key];
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  // SPA 遷移先のチャンクが未読込なら読み込んでから描画し直す。
  useEffect(() => {
    if (!Page) loadPage(key).then(rerender);
  }, [Page, key]);

  // 固定ルート（トップ・/about・/terms 等）の <head> を SPA 遷移時に補正する。
  // /c/<slug>・/s/<slug>・/ranking(/<cat>) の LP は各ページ側、/?q= の検索結果は
  // App 側で applySeo() を呼ぶため、ここでは対象外にする（後勝ちでの上書きを避ける）。
  useEffect(() => {
    if (catSlug || kwSlug || ranking) return;
    if (pathname === "/" && new URLSearchParams(window.location.search).get("q")) return;
    const meta = seoForPath(pathname);
    if (meta) applySeo(meta); // 未知パスは NotFound 側で設定する
  }, [pathname, catSlug, kwSlug, ranking]);

  if (!Page) return null;
  if (key === "landing") return <Page category={category} />;
  if (key === "keyword") return <Page keyword={keyword} />;
  if (key === "ranking") return <Page category={rankingCat ?? "all"} />;
  return <Page />;
}
