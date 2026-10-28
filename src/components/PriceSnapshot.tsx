import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import { PriceData, jpDate, yen } from "../landing/prices";

// キーワード LP の価格セクション（サイト別の価格帯・安い商品・最安値の推移）。
// scripts/prerender.mjs の priceSectionHtml() と同じ内容を MUI で描く。
// Googlebot は JS 実行後の DOM を見るので、静的 HTML と中身を揃えておく必要がある。

const tableSx = {
  width: "100%",
  borderCollapse: "collapse",
  bgcolor: "background.paper",
  fontSize: 14,
  "& th, & td": {
    px: { xs: 1, sm: 1.5 },
    py: 1.25,
    borderTop: "1px solid",
    borderColor: "divider",
    textAlign: "right",
    whiteSpace: "nowrap",
  },
  "& th:first-of-type, & td:first-of-type": { textAlign: "left", whiteSpace: "normal" },
  "& thead th": {
    borderTop: 0,
    bgcolor: "grey.50",
    color: "text.secondary",
    fontSize: 12,
    fontWeight: 600,
  },
} as const;

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        overflowX: "auto",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 3,
        bgcolor: "background.paper",
      }}
    >
      {children}
    </Box>
  );
}

export default function PriceSnapshot({ data }: { data: PriceData }) {
  const bestNew = data.newSummary?.min;
  const bestUsed = data.usedSummary?.min;

  return (
    <>
      <h2>
        {data.term}の価格（{jpDate(data.date)}時点）
      </h2>
      {data.summary.map((t, i) => (
        <p key={i}>{t}</p>
      ))}
      <Frame>
        <Box component="table" sx={tableSx}>
          <thead>
            <tr>
              <th>サイト</th>
              <th>最安</th>
              <th>中央値</th>
              <th>掲載数</th>
            </tr>
          </thead>
          <tbody>
            {data.sites.map((s) => {
              const best = s.min === (s.used ? bestUsed : bestNew);
              return (
                <tr key={s.site}>
                  <td>
                    {s.label}
                    {s.used && (
                      <Typography component="span" variant="body2" color="text.secondary">
                        （中古・フリマ）
                      </Typography>
                    )}
                  </td>
                  <Box component="td" sx={best ? { color: "#b45309", fontWeight: 700 } : undefined}>
                    {yen(s.min)}
                  </Box>
                  <td>{yen(s.median)}</td>
                  <td>{s.count}件</td>
                </tr>
              );
            })}
          </tbody>
        </Box>
      </Frame>

      <h2>サイト別の安い商品</h2>
      <Frame>
        {data.sites.map((s) => (
          <Box key={s.site}>
            <Typography
              variant="body2"
              sx={{ px: 1.75, pt: 1.5, pb: 0.5, color: "text.secondary", fontWeight: 600 }}
            >
              {s.label}
            </Typography>
            {s.items.map((it) => (
              <Box
                key={it.url}
                sx={{
                  display: "flex",
                  gap: 1.5,
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  px: 1.75,
                  py: 1,
                  fontSize: 14,
                }}
              >
                <Box
                  component="a"
                  href={it.url}
                  target="_blank"
                  // noreferrer は付けない（ValueCommerce の計測が REFERRER を見るため）。
                  rel="sponsored noopener"
                  sx={{
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {it.used && (
                    <Chip label="中古" size="small" sx={{ mr: 0.75, height: 18, fontSize: 11 }} />
                  )}
                  {it.title}
                </Box>
                <Box component="b" sx={{ flex: "0 0 auto" }}>
                  {yen(it.price)}
                </Box>
              </Box>
            ))}
          </Box>
        ))}
      </Frame>

      <h2>{data.term}の最安値の推移</h2>
      {data.chartSvg ? (
        // 数値と日付だけからビルド時に作った SVG（PriceData.chartSvg の注記を参照）。
        <Box
          sx={{ mb: 1.5, "& svg": { display: "block", width: "100%", height: "auto" } }}
          dangerouslySetInnerHTML={{ __html: data.chartSvg }}
        />
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          価格は毎日記録しています。推移のグラフは 2 日分以上のデータがそろうと表示されます。
        </Typography>
      )}
      <Frame>
        <Box component="table" sx={tableSx}>
          <thead>
            <tr>
              <th>日付</th>
              <th>ショップ最安</th>
              <th>ショップ中央値</th>
              <th>中古・フリマ最安</th>
            </tr>
          </thead>
          <tbody>
            {data.recent.map((h) => (
              <tr key={h.date}>
                <td>{jpDate(h.date)}</td>
                <td>{h.newMin ? yen(h.newMin) : "-"}</td>
                <td>{h.newMedian ? yen(h.newMedian) : "-"}</td>
                <td>{h.usedMin ? yen(h.usedMin) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </Box>
      </Frame>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, lineHeight: 1.8 }}>
        {data.note}
      </Typography>
    </>
  );
}
