import { useEffect, type MouseEvent } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import SearchIcon from "@mui/icons-material/Search";
import PageLayout from "./PageLayout";
import { Link, navigate } from "../router";
import { applySeo } from "../seo";
import { Category, CATEGORIES, keywordsForCategory } from "../landing";

// カテゴリ別のランディングページ（/c/<slug>）。
// 「〇〇 最安値 / 価格比較」系のロングテール検索の受け皿になる、
// 独自テキスト＋人気キーワードへの導線を持つインデックス対象ページ。
// ビルド時に scripts/prerender.mjs が同じ内容を静的 HTML として書き出す。
export default function Landing({ category }: { category: Category }) {
  // SPA 遷移で来たときのために head を上書きする（直リンクはプリレンダ済み）。
  useEffect(() => {
    applySeo({
      title: category.title,
      description: category.description,
      path: `/c/${category.slug}`,
    });
  }, [category]);

  // キーワードをクリックしたらトップの検索に流す。
  function search(term: string) {
    navigate(`/?q=${encodeURIComponent(term)}`);
  }

  const others = CATEGORIES.filter((c) => c.slug !== category.slug);
  const kwPages = keywordsForCategory(category.slug);

  return (
    <PageLayout title={`${category.name}の価格を横断比較`}>
      <Typography variant="h6" component="p" sx={{ fontWeight: 600, lineHeight: 1.8 }}>
        {category.lead}
      </Typography>

      {category.body.map((p, i) => (
        <p key={i}>{p}</p>
      ))}

      <Box sx={{ my: 3 }}>
        <Button
          variant="contained"
          disableElevation
          startIcon={<SearchIcon />}
          onClick={() => navigate("/")}
        >
          横断検索をはじめる
        </Button>
      </Box>

      <h2>人気のキーワード</h2>
      <p>
        よく検索されている{category.name}のキーワードです。クリックすると、対応する各通販サイトを横断して検索します。
      </p>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, my: 2 }}>
        {category.keywords.map((kw) => (
          <Chip
            key={kw}
            label={kw}
            component="a"
            href={`/?q=${encodeURIComponent(kw)}`}
            clickable
            onClick={(e: MouseEvent) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              e.preventDefault();
              search(kw);
            }}
            sx={{ fontSize: 14 }}
          />
        ))}
      </Box>

      {kwPages.length > 0 && (
        <>
          <h2>人気の商品から探す</h2>
          <Box component="ul" sx={{ pl: 3 }}>
            {kwPages.map((k) => (
              <li key={k.slug}>
                <Link to={`/s/${k.slug}`}>{k.term}の最安値・価格比較</Link>
              </li>
            ))}
          </Box>
        </>
      )}

      <h2>他のカテゴリから探す</h2>
      <Box component="ul" sx={{ pl: 3 }}>
        {others.map((c) => (
          <li key={c.slug}>
            <Link to={`/c/${c.slug}`}>{c.name}の価格を比較</Link>
          </li>
        ))}
      </Box>

      <Box sx={{ mt: 5 }}>
        <Typography variant="body2" color="text.secondary">
          item-search.jp の使い方は<Link to="/about">サイトの説明</Link>をご覧ください。
        </Typography>
      </Box>
    </PageLayout>
  );
}
