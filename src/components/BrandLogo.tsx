import Box from "@mui/material/Box";

// 各サイトのブランドロゴを、外部画像に依存しないインライン SVG で表現する。
// 商品カード左上のオーバーレイとして使用する。

const CJK_FONT = "'Hiragino Sans','Noto Sans JP','Yu Gothic',sans-serif";

// 白背景のワードマーク用ラッパー（Amazon・ヨドバシ・ビックカメラ）。
function WhiteBadge({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        bgcolor: "#fff",
        borderRadius: 1,
        px: 0.6,
        py: 0.3,
        border: "1px solid rgba(0,0,0,0.08)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }}
    >
      {children}
    </Box>
  );
}

// 単色の角丸アイコン用ラッパー（メルカリ・Yahoo!・楽天）。
function SquareBadge({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: "inline-flex",
        borderRadius: 1,
        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
      }}
    >
      {children}
    </Box>
  );
}

function AmazonLogo() {
  return (
    <WhiteBadge>
      <svg viewBox="0 0 90 32" height={16} style={{ display: "block", width: "auto" }}>
        <text
          x={1}
          y={21}
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize={22}
          fontWeight={700}
          letterSpacing={-0.5}
          fill="#232F3E"
        >
          amazon
        </text>
        <path
          d="M7 25 Q45 34 84 25"
          fill="none"
          stroke="#FF9900"
          strokeWidth={3}
          strokeLinecap="round"
        />
        <path d="M84 25 l-1 -5 l6 3 z" fill="#FF9900" />
      </svg>
    </WhiteBadge>
  );
}

function MercariLogo() {
  return (
    <SquareBadge>
      <svg viewBox="0 0 30 30" height={20} style={{ display: "block" }}>
        <rect width={30} height={30} rx={8} fill="#FF211E" />
        <text
          x={15}
          y={16}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize={20}
          fontWeight={800}
          fill="#fff"
        >
          m
        </text>
      </svg>
    </SquareBadge>
  );
}

function YahooLogo() {
  return (
    <SquareBadge>
      <svg viewBox="0 0 30 30" height={20} style={{ display: "block" }}>
        <rect width={30} height={30} rx={8} fill="#FF0033" />
        <text
          x={15}
          y={16}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize={17}
          fontWeight={800}
          fill="#fff"
        >
          Y!
        </text>
      </svg>
    </SquareBadge>
  );
}

function RakutenLogo() {
  return (
    <SquareBadge>
      <svg viewBox="0 0 30 30" height={20} style={{ display: "block" }}>
        <rect width={30} height={30} rx={8} fill="#BF0000" />
        <text
          x={15}
          y={16}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize={19}
          fontWeight={800}
          fill="#fff"
        >
          R
        </text>
      </svg>
    </SquareBadge>
  );
}

function YodobashiLogo() {
  return (
    <WhiteBadge>
      <svg viewBox="0 0 66 22" height={16} style={{ display: "block", width: "auto" }}>
        <text
          x={1}
          y={11}
          dominantBaseline="central"
          fontFamily={CJK_FONT}
          fontSize={15}
          fontWeight={800}
          letterSpacing={-0.5}
          fill="#E60012"
        >
          ヨドバシ
        </text>
      </svg>
    </WhiteBadge>
  );
}

function BiccameraLogo() {
  return (
    <WhiteBadge>
      <svg viewBox="0 0 76 22" height={16} style={{ display: "block", width: "auto" }}>
        <text
          x={1}
          y={12}
          dominantBaseline="central"
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize={16}
          fontWeight={800}
          fill="#E60012"
        >
          BIC
        </text>
        <text
          x={33}
          y={12}
          dominantBaseline="central"
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize={9}
          fontWeight={700}
          letterSpacing={0.3}
          fill="#E60012"
        >
          CAMERA
        </text>
      </svg>
    </WhiteBadge>
  );
}

const LOGOS: Record<string, () => JSX.Element> = {
  amazon: AmazonLogo,
  mercari: MercariLogo,
  yahoo_auction: YahooLogo,
  yodobashi: YodobashiLogo,
  rakuten: RakutenLogo,
  biccamera: BiccameraLogo,
};

export default function BrandLogo({ site }: { site: string }) {
  const Logo = LOGOS[site];
  if (!Logo) return null;
  return <Logo />;
}
