// キーワード LP（/s/<slug>）の価格スナップショット。
// 収集は scripts/collect-prices.mjs（毎日・data/prices/<slug>.json）、
// 要約文・グラフ・インデックス可否の判定は scripts/prerender.mjs が行い、
// 結果をページ内の <script id="price-data"> と /data/prices/<slug>.json に出す。
// ここではそれを読むだけで、表示用の計算はしない（静的 HTML と内容をずらさないため）。

export type PriceItem = {
  title: string;
  price: number;
  url: string;
  shop: string;
  used: boolean;
};

export type PriceSite = {
  site: string;
  label: string;
  /** フリマ・オークション系のサイトか */
  used: boolean;
  count: number;
  min: number;
  median: number;
  max: number;
  items: PriceItem[];
};

export type PriceSummary = {
  min: number;
  minSite: string;
  minLabel: string;
  minTitle: string;
  median: number;
  siteCount: number;
  itemCount: number;
};

export type PriceHistoryRow = {
  date: string;
  newMin: number | null;
  newMedian: number | null;
  usedMin: number | null;
  usedMedian: number | null;
};

export type PriceData = {
  slug: string;
  term: string;
  date: string;
  sites: PriceSite[];
  newSummary: PriceSummary | null;
  usedSummary: PriceSummary | null;
  indexable: boolean;
  description: string;
  summary: string[];
  /** ビルド時に数値だけから生成したインライン SVG（外部由来の文字列は含まない） */
  chartSvg: string | null;
  recent: PriceHistoryRow[];
  note: string;
};

// 直接開いたページなら、prerender が <head> に埋め込んだデータを同期的に読める
// （#root の外にあるので React の描画で消えない）。slug が違えば SPA 遷移後の残骸。
export function embeddedPrice(slug: string): PriceData | null {
  const el = document.getElementById("price-data");
  if (!el?.textContent) return null;
  try {
    const d = JSON.parse(el.textContent) as PriceData;
    return d.slug === slug ? d : null;
  } catch {
    return null;
  }
}

// SPA 遷移で来た場合は静的 JSON を取りに行く。無ければ null（未収集の語）。
export async function fetchPrice(slug: string): Promise<PriceData | null> {
  try {
    const res = await fetch(`/data/prices/${slug}.json`);
    if (!res.ok) return null;
    return (await res.json()) as PriceData;
  } catch {
    return null;
  }
}

export const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;

/** "2026-10-18" → "2026年10月18日" */
export function jpDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y}年${m}月${d}日`;
}
