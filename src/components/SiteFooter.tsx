import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import { Link } from "../router";

// 全ページ共通のフッター。サービスの位置づけ（横断検索・情報提供）と
// 各種ページへの導線、アフィリエイトの開示、免責を簡潔にまとめる。
export default function SiteFooter() {
  return (
    <Box
      component="footer"
      sx={{
        borderTop: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        mt: "auto",
      }}
    >
      <Container maxWidth="md" sx={{ py: 3 }}>
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: { xs: 1.5, sm: 3 },
            mb: 1.5,
          }}
        >
          <Link to="/about" style={{ fontSize: 14, color: "inherit" }}>
            サイトの説明
          </Link>
          <Link to="/terms" style={{ fontSize: 14, color: "inherit" }}>
            利用規約
          </Link>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.8 }}>
          item-search は各オンラインショップの商品情報を横断的に検索・表示する情報提供サービスです。
          当サイトはAmazonアソシエイト・楽天アフィリエイト・バリューコマース等のアフィリエイトプログラムを利用しており、
          リンク経由の購入で収益を得ることがあります。商品の販売・取引は各ショップが行います。
        </Typography>
        <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 1 }}>
          © {"2026"} item-search.jp — Amazon・楽天市場・Yahoo!ショッピング・メルカリ・
          Yahoo!オークション・ヨドバシ・ビックカメラ の商標は各社に帰属します。
        </Typography>
      </Container>
    </Box>
  );
}
