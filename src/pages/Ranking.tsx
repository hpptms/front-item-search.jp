import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import FiberNewIcon from "@mui/icons-material/FiberNew";
import PageLayout from "./PageLayout";
import { Link, navigate } from "../router";
import { applySeo } from "../seo";
import {
  RANKING,
  RankingItem,
  RANKING_CATEGORIES,
  rankingCategoryBySlug,
  seedRankingItems,
  keywordByTerm,
  categoryBySlug,
} from "../landing";
import { fetchRankings } from "../api";

// 検索数ランキング（/ranking = 総合, /ranking/<category> = カテゴリ別）。
// バックエンド（Postgres 集計）からユーザーの実検索数を取得して表示し、
// DB 無効/取得失敗時は静的シード（ranking.json）にフォールバックする。
// SEO 用に scripts/prerender.mjs が各カテゴリの静的 HTML＋ItemList を書き出す。

// 中項目: 集計期間（日 / 月 / 年）。days をバックエンドの ?days= に渡す。
type Period = { key: "day" | "month" | "year"; label: string; days: number };
const PERIODS: Period[] = [
  { key: "day", label: "日", days: 1 },
  { key: "month", label: "月", days: 30 },
  { key: "year", label: "年", days: 365 },
];
const DEFAULT_PERIOD = PERIODS[1]; // 月

// 表示用に正規化した1行。ライブ集計とシードの両方をこの形に寄せる。
type Row = {
  rank: number;
  term: string;
  category: string;
  count?: number; // ライブ集計のときのみ
  trend?: RankingItem["trend"]; // シードのときのみ
  note?: string; // シードのときのみ
  href: string;
};

function hrefForTerm(term: string): string {
  const kw = keywordByTerm(term);
  return kw ? `/s/${kw.slug}` : `/?q=${encodeURIComponent(term)}`;
}

// シード（ranking.json）の基準検索数は月間相当。期間タブに合わせてスケールし、
// ライブ集計が無いときでも「日/月/年」で数字が変わるようにする。
const SEED_PERIOD_FACTOR: Record<Period["key"], number> = {
  day: 0.05,
  month: 1,
  year: 8.5,
};

function buildSeedRows(catSlug: string, period: Period): Row[] {
  const f = SEED_PERIOD_FACTOR[period.key];
  return seedRankingItems(catSlug).map((i) => ({
    rank: i.rank,
    term: i.term,
    category: i.category,
    count: typeof i.count === "number" ? Math.max(1, Math.round(i.count * f)) : undefined,
    trend: i.trend,
    note: i.note,
    href: hrefForTerm(i.term),
  }));
}

function TrendBadge({ trend }: { trend?: RankingItem["trend"] }) {
  if (trend === "up")
    return <ArrowUpwardIcon fontSize="small" aria-label="上昇" sx={{ color: "error.main" }} />;
  if (trend === "down")
    return <ArrowDownwardIcon fontSize="small" aria-label="下降" sx={{ color: "info.main" }} />;
  if (trend === "new")
    return <FiberNewIcon fontSize="small" aria-label="新登場" sx={{ color: "warning.main" }} />;
  return null;
}

// 上位3位はメダルカラーで強調する。
function rankColor(rank: number): string {
  if (rank === 1) return "#d4af37"; // gold
  if (rank === 2) return "#9aa3ab"; // silver
  if (rank === 3) return "#cd7f32"; // bronze
  return "text.secondary";
}

export default function Ranking({ category = "all" }: { category?: string }) {
  const cat = rankingCategoryBySlug(category) ?? RANKING_CATEGORIES[0];
  const catLabel = cat.slug === "all" ? "総合" : cat.label;

  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD);

  // 初期表示はシード（プリレンダ済み内容と一致）→ ライブ取得できたら差し替える。
  const seed: Row[] = buildSeedRows(cat.slug, period);

  const [rows, setRows] = useState<Row[]>(seed);
  const [live, setLive] = useState(false);

  useEffect(() => {
    applySeo({
      title:
        cat.slug === "all"
          ? `人気検索キーワードランキング【${RANKING.period}】 | item-search.jp`
          : `${catLabel}の検索数ランキング | item-search.jp 商品横断検索`,
      description:
        cat.slug === "all"
          ? "Amazon・楽天・Yahoo!ショッピング・メルカリ・ヤフオク・ヨドバシを横断検索できる item-search.jp で、いま最も検索されている商品キーワードのランキング。各キーワードから複数サイトの最安値比較に進めます。"
          : `item-search.jp で検索されている「${catLabel}」の人気商品キーワードを検索数順にランキング。各キーワードから複数の通販サイトを横断して最安値を比較できます。`,
      path: cat.slug === "all" ? "/ranking" : `/ranking/${cat.slug}`,
    });
  }, [cat.slug, catLabel]);

  // ライブ集計を取得（カテゴリ×期間ごと。失敗/空はシードにフォールバック）。
  useEffect(() => {
    const controller = new AbortController();
    setRows(seed);
    setLive(false);
    fetchRankings(cat.slug, period.days, 20, controller.signal).then((res) => {
      if (!res || !res.items.length) return; // フォールバック（シード維持）
      setRows(
        res.items.map((e) => ({
          rank: e.rank,
          term: e.term,
          category: e.category,
          count: e.count,
          href: hrefForTerm(e.term),
        }))
      );
      setLive(true);
    });
    return () => controller.abort();
    // seed は cat.slug から導出されるため依存は cat.slug と period で十分。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat.slug, period.days]);

  const title =
    cat.slug === "all"
      ? `人気検索キーワードランキング【${RANKING.period}】`
      : `${catLabel}の検索数ランキング`;

  return (
    <PageLayout title={title} updatedAt={RANKING.updated}>
      <Typography variant="h6" component="p" sx={{ fontWeight: 600, lineHeight: 1.8 }}>
        {cat.slug === "all"
          ? RANKING.intro
          : `item-search.jp で横断検索されている「${catLabel}」の人気キーワードを、検索数の多い順にランキングしました。気になる商品はそのまま複数サイトの最安値比較に進めます。`}
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        {live
          ? `直近${
              period.key === "day" ? "1日" : period.key === "month" ? "30日" : "1年"
            }（${period.label}間ランキング）の実際の検索数にもとづく集計です。`
          : RANKING.source}
      </Typography>

      {/* 大項目: ジャンル（総合＋カテゴリ別）。内部リンクにもなる。 */}
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 3, mb: 0.5 }}>
        ジャンル
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 2 }}>
        {RANKING_CATEGORIES.map((c) => {
          const to = c.slug === "all" ? "/ranking" : `/ranking/${c.slug}`;
          const selected = c.slug === cat.slug;
          return (
            <Chip
              key={c.slug}
              label={c.label}
              component="a"
              href={to}
              clickable
              color={selected ? "primary" : "default"}
              variant={selected ? "filled" : "outlined"}
              onClick={(e: React.MouseEvent) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                navigate(to);
              }}
              sx={{ fontSize: 14 }}
            />
          );
        })}
      </Box>

      {/* 中項目: 集計期間（日 / 月 / 年）。ページ内で切り替える（URLは変えない）。 */}
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
        期間
      </Typography>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={period.key}
        onChange={(_, v: Period["key"] | null) => {
          if (v) setPeriod(PERIODS.find((p) => p.key === v) ?? DEFAULT_PERIOD);
        }}
        aria-label="集計期間"
        sx={{ mb: 1 }}
      >
        {PERIODS.map((p) => (
          <ToggleButton key={p.key} value={p.key} aria-label={`${p.label}間ランキング`}>
            {p.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {rows.length === 0 ? (
        <Typography color="text.secondary" sx={{ mt: 3 }}>
          このカテゴリのランキングデータはまだ集計中です。
          <Link to="/ranking">総合ランキング</Link>をご覧ください。
        </Typography>
      ) : (
        <Box component="ol" sx={{ listStyle: "none", pl: 0, mt: 2 }}>
          {rows.map((item) => {
            const itemCat = categoryBySlug(item.category);
            return (
              <Box
                component="li"
                key={`${item.rank}-${item.term}`}
                sx={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: { xs: 1.5, sm: 2 },
                  py: 2,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Box
                  sx={{
                    flexShrink: 0,
                    width: { xs: 40, sm: 48 },
                    textAlign: "center",
                    fontWeight: 800,
                    fontSize: { xs: "1.3rem", sm: "1.6rem" },
                    lineHeight: 1.2,
                    color: rankColor(item.rank),
                  }}
                >
                  {item.rank}
                </Box>

                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                    <Link to={item.href} style={{ fontSize: "1.05rem", fontWeight: 700 }}>
                      {item.term}
                    </Link>
                    <TrendBadge trend={item.trend} />
                    {/* 総合ページでは項目のカテゴリを出す（カテゴリ別ページでは冗長なので省く） */}
                    {cat.slug === "all" && itemCat && (
                      <Chip
                        label={itemCat.name}
                        size="small"
                        component="a"
                        href={`/c/${itemCat.slug}`}
                        clickable
                        variant="outlined"
                        sx={{ fontSize: 12 }}
                      />
                    )}
                  </Box>
                  {item.note && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.7 }}>
                      {item.note}
                    </Typography>
                  )}
                  <Typography variant="caption" sx={{ display: "block", mt: 0.5 }}>
                    <Link to={item.href}>「{item.term}」を横断検索して最安値を比較 →</Link>
                  </Typography>
                </Box>

                {/* 検索数（右寄せで目立たせる）。集計できた項目のみ表示。 */}
                {typeof item.count === "number" && (
                  <Box sx={{ flexShrink: 0, textAlign: "right", pl: 1, minWidth: { xs: 56, sm: 72 } }}>
                    <Typography
                      component="span"
                      sx={{
                        fontWeight: 800,
                        fontSize: { xs: "1.05rem", sm: "1.25rem" },
                        color: "primary.main",
                        lineHeight: 1.1,
                      }}
                    >
                      {item.count.toLocaleString("ja-JP")}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", mt: 0.25 }}
                    >
                      回検索
                    </Typography>
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      <h2>ランキングの見方</h2>
      <p>
        {live
          ? `本ランキングは、item-search.jp で実際に検索された回数（${period.label}間集計）をもとにしたものです。ジャンルと期間（日・月・年）で切り替えられ、集計は随時更新されます。`
          : "本ランキングは item-search.jp での注目度をもとに編集部が集計・編集したものです。順位や価格は集計時点のものです。"}
      </p>

      <h2>カテゴリ別ランキング</h2>
      <Box component="ul" sx={{ pl: 3 }}>
        {RANKING_CATEGORIES.filter((c) => c.slug !== "all").map((c) => (
          <li key={c.slug}>
            <Link to={`/ranking/${c.slug}`}>{c.label}の検索数ランキング</Link>
          </li>
        ))}
      </Box>

      <h2>カテゴリ別に価格を比較する</h2>
      <Box component="ul" sx={{ pl: 3 }}>
        {RANKING_CATEGORIES.filter((c) => c.slug !== "all").map((c) => {
          const lp = categoryBySlug(c.slug);
          return lp ? (
            <li key={c.slug}>
              <Link to={`/c/${lp.slug}`}>{lp.name}の価格を比較</Link>
            </li>
          ) : null;
        })}
      </Box>

      <Box sx={{ mt: 5 }}>
        <Typography variant="body2" color="text.secondary">
          item-search.jp の使い方は<Link to="/about">サイトの説明</Link>をご覧ください。
        </Typography>
      </Box>
    </PageLayout>
  );
}
