import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SiteLogo from "../components/SiteLogo";
import SiteFooter from "../components/SiteFooter";
import { navigate } from "../router";

// 利用規約 / サイトの説明など、検索UIとは別の静的ページで使う共通レイアウト。
// ヘッダー（ロゴ＝トップへ戻る）＋読みやすい幅の本文＋共通フッターで構成する。
export default function PageLayout({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt?: string;
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.default",
      }}
    >
      {/* ヘッダー */}
      <Box
        sx={{
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Container maxWidth="md" sx={{ py: 2 }}>
          <Box
            role="link"
            tabIndex={0}
            aria-label="トップへ戻る"
            onClick={() => navigate("/")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") navigate("/");
            }}
            sx={{ display: "inline-flex", cursor: "pointer" }}
          >
            <SiteLogo size={30} />
          </Box>
        </Container>
      </Box>

      {/* 本文 */}
      <Container maxWidth="md" component="main" sx={{ flex: 1, py: { xs: 4, md: 6 } }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate("/")}
          sx={{ mb: 2, color: "text.secondary" }}
          size="small"
        >
          検索に戻る
        </Button>

        <Typography variant="h4" component="h1" sx={{ fontWeight: 700, mb: 1 }}>
          {title}
        </Typography>
        {updatedAt && (
          <Typography variant="body2" color="text.secondary">
            最終更新日: {updatedAt}
          </Typography>
        )}
        <Divider sx={{ my: { xs: 3, md: 4 } }} />

        <Box
          sx={{
            "& h2": {
              fontSize: { xs: "1.15rem", md: "1.3rem" },
              fontWeight: 700,
              mt: { xs: 4, md: 5 },
              mb: 1.5,
            },
            "& h3": {
              fontSize: "1rem",
              fontWeight: 700,
              mt: 3,
              mb: 1,
            },
            "& p": {
              lineHeight: 1.9,
              color: "text.primary",
              mb: 2,
            },
            "& ul, & ol": {
              pl: 3,
              mb: 2,
              "& li": { lineHeight: 1.9, mb: 0.5 },
            },
            // 本文中のリンクは青。ただし塗りつぶしの Chip（component="a" で
            // リンクとして描画される選択中のジャンルなど）は除く。この
            // 子孫セレクタは MUI の .MuiChip-filledPrimary より詳細度が高いため、
            // 除外しないと文字色が背景と同じ青になって読めなくなる。
            // 除外した Chip は MUI 既定の白抜き文字になる。
            "& a:not(.MuiChip-filledPrimary)": {
              color: "primary.main",
              textDecoration: "none",
              "&:hover": { textDecoration: "underline" },
            },
          }}
        >
          {children}
        </Box>
      </Container>

      <SiteFooter />
    </Box>
  );
}
