import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import InputBase from "@mui/material/InputBase";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import LinearProgress from "@mui/material/LinearProgress";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import SearchIcon from "@mui/icons-material/Search";
import HistoryIcon from "@mui/icons-material/History";
import CloseIcon from "@mui/icons-material/Close";
import MenuIcon from "@mui/icons-material/Menu";
import Sidebar from "./components/Sidebar";
import SiteSection from "./components/SiteSection";
import ProductGrid, { GridItem, Density } from "./components/ProductGrid";
import { SearchResponse, SiteResult, searchProductsStream, formatYen } from "./api";
import { Link } from "./router";
import { CATEGORIES } from "./landing";
import { applySearchSeo } from "./seo";

type SortMode = "site" | "asc" | "desc";

// 検索履歴はブラウザの localStorage に保存する（バックエンドには保持しない）。
const HISTORY_KEY = "serch:searchHistory";
const HISTORY_MAX = 20; // ブラウザに保存する件数
const HISTORY_PREVIEW = 5; // 検索フォームのドロップダウンに出す直近件数

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is string => typeof t === "string").slice(0, HISTORY_MAX);
  } catch {
    return [];
  }
}

function saveHistory(list: string[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    // localStorage 使用不可（プライベートモード等）でも検索自体は動かす。
  }
}

export default function App() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("site");
  const [density, setDensity] = useState<Density>("compact");
  const [history, setHistory] = useState<string[]>(() => loadHistory());
  const [historyOpen, setHistoryOpen] = useState(false);
  // スマホ / タブレットのサイドバー（ドロワー）の開閉。PC では常設なので使わない。
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  function recordHistory(term: string) {
    setHistory((prev) => {
      const next = [term, ...prev.filter((t) => t !== term)].slice(0, HISTORY_MAX);
      saveHistory(next);
      return next;
    });
  }

  function removeHistory(term: string) {
    setHistory((prev) => {
      const next = prev.filter((t) => t !== term);
      saveHistory(next);
      return next;
    });
  }

  async function runSearch(q: string) {
    const term = q.trim();
    if (!term) return;

    // 検索結果表示中は noindex,follow ＋ canonical=トップ に切り替える。
    applySearchSeo(term);

    recordHistory(term);
    setHistoryOpen(false);

    // GA4: 何が検索されたかを計測する（標準の search イベント）。
    window.gtag?.("event", "search", { search_term: term });
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    // 新しい検索を開始したら前回の結果はクリアする（ストリームで順次埋めていく）。
    setData({ query: term, sites: [] });
    try {
      // 完了したサイトから順に受け取り、その都度画面へ反映する（体感速度重視）。
      // 同一サイトが再送された場合は置き換える（安全策）。
      await searchProductsStream(
        term,
        20,
        (site: SiteResult) => {
          // 既にキャンセル済み（新しい検索が始まった）なら反映しない。
          if (controller.signal.aborted) return;
          setData((prev) => {
            const base = prev && prev.query === term ? prev.sites : [];
            const rest = base.filter((s) => s.site !== site.site);
            return { query: term, sites: [...rest, site] };
          });
        },
        controller.signal
      );
      // GA4: 検索結果の件数も計測しておく（全サイト到着後）。
      setData((prev) => {
        if (prev) {
          const count = prev.sites.reduce((sum, s) => sum + s.items.length, 0);
          window.gtag?.("event", "search_results", {
            search_term: term,
            results_count: count,
          });
        }
        return prev;
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message);
        setData(null); // エラー時は「0件」ブロックを出さない
      }
    } finally {
      setLoading(false);
    }
  }

  // URL に ?q=... が付いていれば（LP のキーワードリンクや構造化データの
  // SearchAction 経由）その語で自動的に検索を実行する。
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q && q.trim()) {
      setQuery(q);
      runSearch(q);
    }
    // 初回マウント時のみ。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalItems =
    data?.sites.reduce((sum, s) => sum + s.items.length, 0) ?? 0;

  // 全サイト横断での最安値（price>0 の中で最小）。独自価値としてバナーで強調する。
  const cheapest: { item: GridItem["item"]; label: string } | null = (() => {
    if (!data) return null;
    let best: { item: GridItem["item"]; label: string } | null = null;
    for (const s of data.sites) {
      for (const item of s.items) {
        if (item.price > 0 && (!best || item.price < best.item.price)) {
          best = { item, label: s.label };
        }
      }
    }
    return best;
  })();

  // 価格順表示用に、全サイトの商品を1つのリストに集約してソートする。
  // 価格情報なし（price=0）は末尾に回す。
  const sortedItems: GridItem[] = (() => {
    if (!data || sortMode === "site") return [];
    const flat: GridItem[] = data.sites.flatMap((s) =>
      s.items.map((item) => ({ item, site: s.site }))
    );
    const priced = flat.filter((f) => f.item.price > 0);
    const unpriced = flat.filter((f) => !f.item.price);
    priced.sort((a, b) =>
      sortMode === "asc"
        ? a.item.price - b.item.price
        : b.item.price - a.item.price
    );
    return [...priced, ...unpriced];
  })();

  return (
    <Box sx={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar
        history={history}
        onSelect={(term) => {
          setQuery(term);
          runSearch(term);
        }}
        onRemove={removeHistory}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      <Box
        component="main"
        sx={{
          flex: 1,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          bgcolor: "background.default",
        }}
      >
        {/* ヘッダー + 検索バー */}
        <Box
          sx={{
            px: { xs: 2, md: 4 },
            py: { xs: 1.5, md: 2.5 },
            borderBottom: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
            {/* スマホ / タブレットではサイドバーを開くアイコンを表示する（PC では非表示） */}
            <IconButton
              onClick={() => setSidebarOpen(true)}
              aria-label="メニューを開く"
              edge="start"
              sx={{
                display: { xs: "inline-flex", md: "none" },
                "@media (pointer: coarse)": { display: "inline-flex" },
              }}
            >
              <MenuIcon />
            </IconButton>
            <Typography
              variant="h6"
              component="h1"
              sx={{ fontSize: { xs: "1rem", md: "1.25rem" } }}
            >
              item-search — オンラインショップをまたいで一括検索
            </Typography>
          </Box>
          <Box
            component="form"
            onSubmit={(e) => {
              e.preventDefault();
              runSearch(query);
            }}
            sx={{ display: "flex", gap: 1.5, maxWidth: 720 }}
          >
            <Box sx={{ position: "relative", flex: 1, display: "flex" }}>
              <Paper
                variant="outlined"
                sx={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  px: 1.5,
                  borderColor: "divider",
                }}
              >
                <SearchIcon fontSize="small" color="action" />
                <InputBase
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setHistoryOpen(true)}
                  onBlur={() => setHistoryOpen(false)}
                  placeholder="商品名を入力（例: Nintendo Switch）"
                  sx={{ ml: 1, flex: 1 }}
                />
                {query && (
                  <IconButton size="small" onClick={() => setQuery("")}>
                    ×
                  </IconButton>
                )}
              </Paper>

              {/* 検索履歴（ブラウザ保存・最大5件） */}
              {historyOpen && history.length > 0 && (
                <Paper
                  elevation={4}
                  // 入力の blur より先に反応させ、クリックでフォーカスが外れないようにする。
                  onMouseDown={(e) => e.preventDefault()}
                  sx={{
                    position: "absolute",
                    top: "calc(100% + 4px)",
                    left: 0,
                    right: 0,
                    zIndex: 10,
                    py: 0.5,
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ px: 1.5, py: 0.5, display: "block" }}
                  >
                    最近の検索
                  </Typography>
                  {history.slice(0, HISTORY_PREVIEW).map((term) => (
                    <Box
                      key={term}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        px: 1.5,
                        py: 0.75,
                        cursor: "pointer",
                        "&:hover": { bgcolor: "action.hover" },
                      }}
                      onClick={() => {
                        setQuery(term);
                        runSearch(term);
                      }}
                    >
                      <HistoryIcon
                        fontSize="small"
                        sx={{ color: "text.disabled", mr: 1 }}
                      />
                      <Typography variant="body2" sx={{ flex: 1 }} noWrap>
                        {term}
                      </Typography>
                      <IconButton
                        size="small"
                        aria-label={`${term} を履歴から削除`}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeHistory(term);
                        }}
                      >
                        <CloseIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Box>
                  ))}
                </Paper>
              )}
            </Box>
            <Button
              type="submit"
              variant="contained"
              disableElevation
              disabled={loading || !query.trim()}
            >
              検索
            </Button>
          </Box>
        </Box>

        {loading && <LinearProgress />}

        {/* 結果エリア */}
        <Box sx={{ flex: 1, overflow: "auto", p: { xs: 2, md: 4 } }}>
          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          {!data && !loading && !error && (
            <Box sx={{ textAlign: "center", color: "text.secondary", mt: 10 }}>
              <SearchIcon sx={{ fontSize: 48, opacity: 0.3 }} />
              <Typography sx={{ mt: 1 }}>
                キーワードを入力して、複数サイトを一括検索
              </Typography>
              <Typography variant="caption">
                Amazon・メルカリ・Yahoo!オークション・ヨドバシ・楽天・ビックカメラ
              </Typography>

              {/* 人気検索ランキング（linkable asset）への導線。 */}
              <Box sx={{ mt: 4 }}>
                <Link
                  to="/ranking"
                  style={{ fontSize: 14, color: "inherit", textDecoration: "underline" }}
                >
                  📈 いま人気の検索キーワードランキングを見る
                </Link>
              </Box>

              {/* カテゴリ別ページへの導線。人気ジャンルから探せる＋内部リンクになる。 */}
              <Box sx={{ mt: 3 }}>
                <Typography variant="caption" sx={{ display: "block", mb: 1 }}>
                  ジャンルから探す
                </Typography>
                <Box
                  sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 1,
                    justifyContent: "center",
                    maxWidth: 560,
                    mx: "auto",
                  }}
                >
                  {CATEGORIES.map((c) => (
                    <Link
                      key={c.slug}
                      to={`/c/${c.slug}`}
                      style={{
                        fontSize: 13,
                        color: "inherit",
                        textDecoration: "underline",
                        opacity: 0.8,
                      }}
                    >
                      {c.name}
                    </Link>
                  ))}
                </Box>
              </Box>
            </Box>
          )}

          {data && (
            <>
              <Box
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 1.5,
                  mb: 2,
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  「{data.query}」の検索結果 — 全 {totalItems} 件 / {data.sites.length} サイト
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={sortMode}
                    onChange={(_, v: SortMode | null) => v && setSortMode(v)}
                    aria-label="並び替え"
                  >
                    <ToggleButton value="site" aria-label="サイト順">
                      サイト順
                    </ToggleButton>
                    <ToggleButton value="asc" aria-label="安い順">
                      安い順
                    </ToggleButton>
                    <ToggleButton value="desc" aria-label="高い順">
                      高い順
                    </ToggleButton>
                  </ToggleButtonGroup>

                  {/* カードの表示サイズ切り替え */}
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={density}
                    onChange={(_, v: Density | null) => v && setDensity(v)}
                    aria-label="カードサイズ"
                  >
                    <ToggleButton value="comfortable" aria-label="標準サイズ">
                      標準
                    </ToggleButton>
                    <ToggleButton value="compact" aria-label="小サイズ">
                      小
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Box>
              </Box>

              {/* 最安値ハイライト（横断検索ならではの独自価値） */}
              {cheapest && (
                <Box
                  component="a"
                  href={cheapest.item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    mb: 3,
                    p: { xs: 1.5, md: 2 },
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: "success.main",
                    bgcolor: "rgba(46,125,50,.06)",
                    textDecoration: "none",
                    color: "inherit",
                    transition: "background-color .15s",
                    "&:hover": { bgcolor: "rgba(46,125,50,.12)" },
                  }}
                >
                  {cheapest.item.image && (
                    <Box
                      component="img"
                      src={cheapest.item.image}
                      alt=""
                      loading="lazy"
                      sx={{
                        width: 48,
                        height: 48,
                        objectFit: "contain",
                        flexShrink: 0,
                        bgcolor: "#fff",
                        borderRadius: 1,
                      }}
                    />
                  )}
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography
                      variant="caption"
                      sx={{ color: "success.main", fontWeight: 700, display: "block" }}
                    >
                      最安値 — {cheapest.label}
                    </Typography>
                    <Typography variant="body2" noWrap sx={{ color: "text.primary" }}>
                      {cheapest.item.title}
                    </Typography>
                  </Box>
                  <Typography
                    variant="h6"
                    sx={{ fontWeight: 800, color: "success.main", flexShrink: 0 }}
                  >
                    {formatYen(cheapest.item.price)}
                  </Typography>
                </Box>
              )}

              {sortMode === "site" ? (
                data.sites.map((s) => (
                  <SiteSection
                    key={s.site}
                    result={s}
                    density={density}
                    highlightUrl={cheapest?.item.url}
                  />
                ))
              ) : (
                <ProductGrid
                  keyPrefix={`sort-${sortMode}`}
                  items={sortedItems}
                  density={density}
                  highlightUrl={cheapest?.item.url}
                />
              )}
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
