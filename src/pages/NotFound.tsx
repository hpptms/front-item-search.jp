import { useEffect } from "react";
import PageLayout from "./PageLayout";
import { Link } from "../router";
import { applySeo, ROUTE_SEO } from "../seo";
import { CATEGORIES } from "../landing";

// 未知パスの 404 ページ。Cloudflare Pages は dist/404.html（scripts/prerender.mjs が
// 同じ内容で生成）を HTTP 404 で返し、JS 起動後はこのコンポーネントが描画する。
// 以前は未知パスでも検索 UI を 200 で返しており、トップの重複（ソフト404）になっていた。
export default function NotFound() {
  useEffect(() => {
    applySeo({
      title: "ページが見つかりません | item-search.jp",
      description: ROUTE_SEO["/"].description,
      path: "/",
      robots: "noindex, follow",
    });
  }, []);

  return (
    <PageLayout title="ページが見つかりません">
      <p>
        お探しのページは移動または削除されたか、URL が間違っている可能性があります。
        <Link to="/">トップページ</Link>から商品名で横断検索するか、下のジャンルからお探しください。
      </p>
      <h2>ジャンルから探す</h2>
      <ul>
        {CATEGORIES.map((c) => (
          <li key={c.slug}>
            <Link to={`/c/${c.slug}`}>{c.name}の価格を比較</Link>
          </li>
        ))}
      </ul>
    </PageLayout>
  );
}
