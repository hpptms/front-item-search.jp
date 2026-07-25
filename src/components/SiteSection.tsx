import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import { SiteResult } from "../api";
import ProductCard from "./ProductCard";

export default function SiteSection({ result }: { result: SiteResult }) {
  const count = result.items.length;
  return (
    <Box component="section" sx={{ mb: 5 }}>
      {/* サイト見出し */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          mb: 1.5,
          position: "sticky",
          top: 0,
          zIndex: 1,
          bgcolor: "background.default",
          py: 1,
        }}
      >
        <Typography variant="h6" fontWeight={700}>
          {result.label}
        </Typography>
        <Chip
          size="small"
          label={`${count} 件`}
          color={count > 0 ? "primary" : "default"}
          variant="outlined"
        />
        <Typography variant="caption" color="text.secondary">
          {result.elapsedMs} ms
        </Typography>
      </Box>

      {result.error ? (
        <Alert severity="warning" variant="outlined">
          {result.error}
        </Alert>
      ) : count === 0 ? (
        <Typography variant="body2" color="text.secondary">
          該当する商品が見つかりませんでした。
        </Typography>
      ) : (
        <Box
          sx={{
            display: "grid",
            gap: 1.5,
            gridTemplateColumns: {
              xs: "repeat(2, 1fr)",
              sm: "repeat(3, 1fr)",
              md: "repeat(4, 1fr)",
              lg: "repeat(5, 1fr)",
            },
          }}
        >
          {result.items.map((item, i) => (
            <ProductCard key={`${result.site}-${i}`} item={item} />
          ))}
        </Box>
      )}
    </Box>
  );
}
