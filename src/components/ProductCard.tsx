import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Link from "@mui/material/Link";
import { Item, formatYen } from "../api";
import BrandLogo from "./BrandLogo";
import { Density } from "./ProductGrid";

export default function ProductCard({
  item,
  site,
  density = "comfortable",
  highlight = false,
}: {
  item: Item;
  site: string;
  density?: Density;
  /** 全サイト横断での最安値カードに付ける強調表示。 */
  highlight?: boolean;
}) {
  const compact = density === "compact";
  return (
    <Link
      href={item.url}
      target="_blank"
      // noreferrer は付けない: ValueCommerce の referral は Referer を発リンク元サイトの
      // 記録に使う（付けると計測エントリの REFERRER が空になる）。
      // 送出値は _headers の Referrer-Policy: strict-origin-when-cross-origin により
      // オリジン(https://item-search.jp/)までなので、プライバシー面の影響もない。
      rel="noopener sponsored"
      underline="none"
      sx={{
        display: "block",
        // グリッドの列幅より広がらないようにする（長い商品名で列を押し広げない）。
        minWidth: 0,
        maxWidth: "100%",
        borderRadius: 2,
        border: highlight ? "2px solid" : "1px solid",
        borderColor: highlight ? "success.main" : "divider",
        overflow: "hidden",
        bgcolor: "background.paper",
        boxShadow: highlight ? "0 0 0 3px rgba(46,125,50,.15)" : "none",
        transition: "border-color .15s, transform .15s",
        "&:hover": { borderColor: highlight ? "success.main" : "primary.main", transform: "translateY(-2px)" },
      }}
    >
      {/* 画像（正方形） */}
      <Box
        sx={{
          position: "relative",
          width: "100%",
          pt: "100%",
          bgcolor: "#f1f3f5",
        }}
      >
        {/* ブランドロゴ（左上オーバーレイ） */}
        <Box sx={{ position: "absolute", top: 6, left: 6, zIndex: 2 }}>
          <BrandLogo site={site} />
        </Box>

        {/* 最安値バッジ（右上オーバーレイ） */}
        {highlight && (
          <Box
            sx={{
              position: "absolute",
              top: 6,
              right: 6,
              zIndex: 2,
              px: 0.75,
              py: 0.25,
              borderRadius: 1,
              bgcolor: "success.main",
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              lineHeight: 1.4,
            }}
          >
            最安値
          </Box>
        )}

        {item.image ? (
          <Box
            component="img"
            src={item.image}
            alt={item.title}
            loading="lazy"
            sx={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
            }}
          />
        ) : (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "text.secondary",
              fontSize: 12,
            }}
          >
            No Image
          </Box>
        )}
      </Box>

      {/* テキスト */}
      <Box sx={{ p: compact ? 0.75 : 1.25 }}>
        <Typography
          variant={compact ? "caption" : "body2"}
          sx={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            // 長い英数字の型番などでカード幅をはみ出さないようにする。
            overflowWrap: "anywhere",
            minHeight: compact ? 30 : 40,
            lineHeight: 1.4,
            color: "text.primary",
          }}
        >
          {item.title}
        </Typography>
        <Typography
          variant={compact ? "caption" : "subtitle2"}
          sx={{
            mt: compact ? 0.25 : 0.5,
            fontWeight: 700,
            color: "primary.main",
            display: "block",
          }}
        >
          {formatYen(item.price)}
        </Typography>
        {/* compact では店舗名を省いて高さを抑える */}
        {!compact && item.shop && (
          <Typography variant="caption" color="text.secondary" noWrap display="block">
            {item.shop}
          </Typography>
        )}
      </Box>
    </Link>
  );
}
