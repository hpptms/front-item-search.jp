import Box from "@mui/material/Box";
import { Item } from "../api";
import ProductCard from "./ProductCard";

export type GridItem = { item: Item; site: string };

// カードの表示密度。"comfortable" は従来サイズ、"compact" は小さめで横に多数並べる。
export type Density = "comfortable" | "compact";

// 密度ごとのグリッド列数。compact は大画面で約10個/行を目安にする。
const COLUMNS: Record<Density, Record<"xs" | "sm" | "md" | "lg", string>> = {
  comfortable: {
    xs: "repeat(2, 1fr)",
    sm: "repeat(3, 1fr)",
    md: "repeat(4, 1fr)",
    lg: "repeat(5, 1fr)",
  },
  compact: {
    xs: "repeat(3, 1fr)",
    sm: "repeat(5, 1fr)",
    md: "repeat(7, 1fr)",
    lg: "repeat(10, 1fr)",
  },
};

// 商品カードのレスポンシブグリッド。サイト別セクションと横断ソート表示で共用する。
export default function ProductGrid({
  items,
  keyPrefix,
  density = "comfortable",
  highlightUrl,
}: {
  items: GridItem[];
  keyPrefix: string;
  density?: Density;
  /** このURLの商品を最安値として強調する。 */
  highlightUrl?: string;
}) {
  return (
    <Box
      sx={{
        display: "grid",
        gap: density === "compact" ? 1 : 1.5,
        gridTemplateColumns: COLUMNS[density],
      }}
    >
      {items.map(({ item, site }, i) => (
        <ProductCard
          key={`${keyPrefix}-${site}-${i}`}
          item={item}
          site={site}
          density={density}
          highlight={!!highlightUrl && item.url === highlightUrl}
        />
      ))}
    </Box>
  );
}
