import { useEffect } from "react";
import App from "./App";
import About from "./pages/About";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import Landing from "./pages/Landing";
import KeywordLanding from "./pages/KeywordLanding";
import Ranking from "./pages/Ranking";
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

// pathname に応じてトップ（検索UI）／静的ページ／カテゴリ LP／キーワード LP を描画する。
export default function Root() {
  const pathname = usePathname();
  const catSlug = landingSlug(pathname);
  const category = catSlug ? categoryBySlug(catSlug) : undefined;
  const kwSlug = keywordSlug(pathname);
  const keyword = kwSlug ? keywordBySlug(kwSlug) : undefined;
  const rankingCat = rankingCategorySlug(pathname);
  const ranking = isRankingPath(pathname) || rankingCat !== null;

  // 固定ルート（トップ・/about・/terms 等）の <head> を SPA 遷移時に補正する。
  // /c/<slug>・/s/<slug>・/ranking(/<cat>) の LP は各ページ側、/?q= の検索結果は
  // App 側で applySeo() を呼ぶため、ここでは対象外にする（後勝ちでの上書きを避ける）。
  useEffect(() => {
    if (catSlug || kwSlug || ranking) return;
    if (pathname === "/" && new URLSearchParams(window.location.search).get("q")) return;
    applySeo(seoForPath(pathname));
  }, [pathname, catSlug, kwSlug, ranking]);

  if (category) return <Landing category={category} />;
  if (keyword) return <KeywordLanding keyword={keyword} />;
  if (ranking) return <Ranking category={rankingCat ?? "all"} />;

  switch (pathname) {
    case "/about":
      return <About />;
    case "/terms":
      return <Terms />;
    case "/privacy":
      return <Privacy />;
    default:
      // 未知の /c/<slug> を含む未知パスは検索 UI にフォールバックする。
      return <App />;
  }
}
