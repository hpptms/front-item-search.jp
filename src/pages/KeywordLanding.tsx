import { useEffect, useState, type MouseEvent } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import SearchIcon from "@mui/icons-material/Search";
import PageLayout from "./PageLayout";
import { Link, navigate } from "../router";
import { applySeo } from "../seo";
import { Keyword, categoryBySlug } from "../landing";
import { PriceData, embeddedPrice, fetchPrice } from "../landing/prices";
import PriceSnapshot from "../components/PriceSnapshot";

// キーワード単位のランディングページ（/s/<slug>）。
// 「〇〇 最安値 / 価格比較」系の指名検索の受け皿。独自テキスト＋
// その語での横断検索への強い導線＋関連キーワードを持つ。
// ビルド時に scripts/prerender.mjs が同じ内容を静的 HTML として書き出す。
export default function KeywordLanding({ keyword }: { keyword: Keyword }) {
  // 価格データ。直接開いたページはプリレンダの埋め込みから同期的に読み、
  // SPA 遷移で来たときは静的 JSON を取りに行く（done=false の間は取得中）。
  const [price, setPrice] = useState<{ slug: string; data: PriceData | null; done: boolean }>(
    () => {
      const data = embeddedPrice(keyword.slug);
      return { slug: keyword.slug, data, done: data !== null };
    }
  );
  const current = price.slug === keyword.slug ? price : { slug: keyword.slug, data: null, done: false };

  useEffect(() => {
    if (current.done) return;
    let alive = true;
    fetchPrice(keyword.slug).then((data) => {
      if (alive) setPrice({ slug: keyword.slug, data, done: true });
    });
    return () => {
      alive = false;
    };
  }, [keyword.slug, current.done]);

  // robots・説明文はプリレンダ（scripts/prerender.mjs の priceState）と同じ判定結果に揃える。
  // 価格データが無い／薄い語は noindex、canonical を持つ重複語は正規ページを指す。
  useEffect(() => {
    if (!current.done) return;
    applySeo({
      title: keyword.title,
      description: current.data?.description ?? keyword.description,
      path: `/s/${keyword.canonical ?? keyword.slug}`,
      robots:
        keyword.canonical || current.data?.indexable ? undefined : "noindex, follow",
    });
  }, [keyword, current.done, current.data]);

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

      {current.data && <PriceSnapshot data={current.data} />}

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
