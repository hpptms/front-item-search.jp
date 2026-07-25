import { useRef, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import InputBase from "@mui/material/InputBase";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import LinearProgress from "@mui/material/LinearProgress";
import SearchIcon from "@mui/icons-material/Search";
import Sidebar from "./components/Sidebar";
import SiteSection from "./components/SiteSection";
import { SearchResponse, searchProducts } from "./api";

export default function App() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SearchResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function runSearch(q: string) {
    const term = q.trim();
    if (!term) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await searchProducts(term, 20, controller.signal);
      setData(res);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }

  const totalItems =
    data?.sites.reduce((sum, s) => sum + s.items.length, 0) ?? 0;

  return (
    <Box sx={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar />

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
            px: 4,
            py: 2.5,
            borderBottom: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          <Typography variant="h6" sx={{ mb: 1.5 }}>
            商品横断検索
          </Typography>
          <Box
            component="form"
            onSubmit={(e) => {
              e.preventDefault();
              runSearch(query);
            }}
            sx={{ display: "flex", gap: 1.5, maxWidth: 720 }}
          >
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
                placeholder="商品名を入力（例: Nintendo Switch）"
                sx={{ ml: 1, flex: 1 }}
              />
              {query && (
                <IconButton size="small" onClick={() => setQuery("")}>
                  ×
                </IconButton>
              )}
            </Paper>
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
        <Box sx={{ flex: 1, overflow: "auto", p: 4 }}>
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
            </Box>
          )}

          {data && (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                「{data.query}」の検索結果 — 全 {totalItems} 件 / {data.sites.length} サイト
              </Typography>
              {data.sites.map((s) => (
                <SiteSection key={s.site} result={s} />
              ))}
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
