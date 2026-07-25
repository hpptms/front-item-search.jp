import Box from "@mui/material/Box";

// サイト自身のロゴ。虫めがね＝「検索」、レンズ内の4つのドット＝「複数の商品／ショップ」を
// 表し、"オンラインショップを横断して探す" という目的が一目で伝わるようにしている。
// 外部画像に依存しないインライン SVG（favicon.svg と図柄を揃えている）。

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 32 32"
      role="img"
      aria-label="item-search ロゴ"
      sx={{ width: size, height: size, display: "block", flexShrink: 0 }}
    >
      <defs>
        <linearGradient id="serchLogoGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#serchLogoGrad)" />
      {/* レンズ内の商品グリッド（4つのドット） */}
      <g fill="#fff">
        <circle cx="11.3" cy="11.3" r="1.5" />
        <circle cx="16.7" cy="11.3" r="1.5" />
        <circle cx="11.3" cy="16.7" r="1.5" />
        <circle cx="16.7" cy="16.7" r="1.5" />
      </g>
      {/* 虫めがね（レンズ＋持ち手） */}
      <g fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round">
        <circle cx="14" cy="14" r="7" />
        <line x1="19.2" y1="19.2" x2="24.6" y2="24.6" />
      </g>
    </Box>
  );
}

export default function SiteLogo({
  size = 30,
  showWordmark = true,
}: {
  size?: number;
  showWordmark?: boolean;
}) {
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
      <LogoMark size={size} />
      {showWordmark && (
        <Box
          component="span"
          sx={{
            fontWeight: 800,
            fontSize: size * 0.6,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          <Box component="span" sx={{ color: "text.primary" }}>
            item-
          </Box>
          <Box component="span" sx={{ color: "primary.main" }}>
            search
          </Box>
        </Box>
      )}
    </Box>
  );
}
