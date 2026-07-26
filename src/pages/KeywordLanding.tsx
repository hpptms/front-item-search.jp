import { useEffect, type MouseEvent } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import SearchIcon from "@mui/icons-material/Search";
import PageLayout from "./PageLayout";
import { Link, navigate } from "../router";
import { applySeo } from "../seo";
import { Keyword, categoryBySlug } from "../landing";

// キーワード単位のランディングページ（/s/<slug>）。
// 「〇〇 最安値 / 価格比較」系の指名検索の受け皿。独自テキスト＋
// その語での横断検索への強い導線＋関連キーワードを持つ。
// ビルド時に scripts/prerender.mjs が同じ内容を静的 HTML として書き出す。
export default function KeywordLanding({ keyword }: { keyword: Keyword }) {
  useEffect(() => {
    applySeo({
      title: keyword.title,
      description: keyword.description,
      path: `/s/${keyword.slug}`,
    });
  }, [keyword]);

  function search(term: string) {
    navigate(`/?q=${encodeURIComponent(term)}`);
  }

  const category = categoryBySlug(keyword.category);

  return (
    <PageLayout title={`${keyword.term}の最安値・価格比較`}>
      <Typography variant="h6" component="p" sx={{ fontWeight: 600, lineHeight: 1.8 }}>
        {keyword.lead}
      </Typography>

      {keyword.body.map((p, i) => (
        <p key={i}>{p}</p>
      ))}

      <Box sx={{ my: 3 }}>
        <Button
          variant="contained"
          disableElevation
          size="large"
          startIcon={<SearchIcon />}
          onClick={() => search(keyword.term)}
        >
          「{keyword.term}」を横断検索する
        </Button>
      </Box>

      <h2>関連キーワード</h2>
      <p>あわせて比較されることが多いキーワードです。クリックで横断検索します。</p>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, my: 2 }}>
        {keyword.related.map((kw) => (
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

      {category && (
        <Box sx={{ mt: 5 }}>
          <Typography variant="body2" color="text.secondary">
            関連カテゴリ: <Link to={`/c/${category.slug}`}>{category.name}の価格を比較</Link>
          </Typography>
        </Box>
      )}
    </PageLayout>
  );
}
