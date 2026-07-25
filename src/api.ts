// バックエンド検索 API の型とクライアント。

export type Item = {
  title: string;
  price: number;
  currency: string;
  image: string;
  url: string;
  shop: string;
};

export type SiteResult = {
  site: string;
  label: string;
  items: Item[];
  error?: string;
  elapsedMs: number;
};

export type SearchResponse = {
  query: string;
  sites: SiteResult[];
};

export async function searchProducts(
  query: string,
  limit = 20,
  signal?: AbortSignal
): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const res = await fetch(`/api/search?${params.toString()}`, { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `検索に失敗しました (${res.status})`);
  }
  return res.json() as Promise<SearchResponse>;
}

export function formatYen(price: number): string {
  if (!price) return "価格情報なし";
  return "¥" + price.toLocaleString("ja-JP");
}
