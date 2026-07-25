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
}: {
  item: Item;
  site: string;
  density?: Density;
}) {
  const compact = density === "compact";
  return (
    <Link
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      underline="none"
      sx={{
        display: "block",
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        overflow: "hidden",
        bgcolor: "background.paper",
        transition: "border-color .15s, transform .15s",
        "&:hover": { borderColor: "primary.main", transform: "translateY(-2px)" },
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
