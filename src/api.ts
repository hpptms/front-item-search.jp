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

// searchProductsStream は NDJSON ストリーミング版。完了したサイトから 1 件ずつ
// onSite を呼ぶので、速いサイトを即描画でき体感が速い。ストリーム未対応環境
// （古いブラウザ等）では buffered な searchProducts に自動フォールバックする。
export async function searchProductsStream(
  query: string,
  limit: number,
  onSite: (site: SiteResult) => void,
  signal?: AbortSignal
): Promise<void> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const res = await fetch(`/api/search/stream?${params.toString()}`, { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `検索に失敗しました (${res.status})`);
  }
  if (!res.body) {
    // ReadableStream 非対応: 一括取得にフォールバック。
    const full = await searchProducts(query, limit, signal);
    full.sites.forEach(onSite);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  const flushLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      onSite(JSON.parse(trimmed) as SiteResult);
    } catch {
      // 途中で切れた壊れた行は無視する。
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      flushLine(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
  }
  buf += decoder.decode();
  flushLine(buf);
}

export function formatYen(price: number): string {
  if (!price) return "価格情報なし";
  return "¥" + price.toLocaleString("ja-JP");
}

// ---- 検索数ランキング -----------------------------------------------------

export type RankingEntry = {
  rank: number;
  term: string;
  category: string;
  count: number;
};

export type RankingResponse = {
  category: string;
  days: number;
  items: RankingEntry[];
};

// fetchRankings はバックエンドの集計（ユーザーの実検索数）を取得する。
// category は "all" または カテゴリ slug。DB 無効時はバックエンドが 503 を返すので
// null を返し、呼び出し側は静的シード（ranking.json）にフォールバックする。
export async function fetchRankings(
  category = "all",
  days = 30,
  limit = 20,
  signal?: AbortSignal
): Promise<RankingResponse | null> {
  const params = new URLSearchParams({
    category,
    days: String(days),
    limit: String(limit),
  });
  try {
    const res = await fetch(`/api/rankings?${params.toString()}`, { signal });
    if (!res.ok) return null; // 503（DB無効）や一時エラーはフォールバックへ
    return (await res.json()) as RankingResponse;
  } catch {
    return null; // ネットワークエラー等もフォールバック
  }
}
