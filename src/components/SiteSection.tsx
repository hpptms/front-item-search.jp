import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import { SiteResult } from "../api";
import ProductGrid, { Density } from "./ProductGrid";

export default function SiteSection({
  result,
  density = "comfortable",
  highlightUrl,
}: {
  result: SiteResult;
  density?: Density;
  /** 全サイト横断での最安値商品のURL（あれば該当カードを強調）。 */
  highlightUrl?: string;
}) {
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
        <ProductGrid
          keyPrefix={result.site}
          items={result.items.map((item) => ({ item, site: result.site }))}
          density={density}
          highlightUrl={highlightUrl}
        />
      )}
    </Box>
  );
}
