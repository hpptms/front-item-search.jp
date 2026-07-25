import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Link from "@mui/material/Link";
import { Item, formatYen } from "../api";

export default function ProductCard({ item }: { item: Item }) {
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
      <Box sx={{ p: 1.25 }}>
        <Typography
          variant="body2"
          sx={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            minHeight: 40,
            lineHeight: 1.4,
            color: "text.primary",
          }}
        >
          {item.title}
        </Typography>
        <Typography
          variant="subtitle2"
          sx={{ mt: 0.5, fontWeight: 700, color: "primary.main" }}
        >
          {formatYen(item.price)}
        </Typography>
        {item.shop && (
          <Typography variant="caption" color="text.secondary" noWrap display="block">
            {item.shop}
          </Typography>
        )}
      </Box>
    </Link>
  );
}
