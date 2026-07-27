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

// --- 受け取ったデータの検証 -------------------------------------------------
// 商品 URL / 画像 URL は元をたどると外部サイトの HTML や API のレスポンス。
// これを <a href> や <img src> にそのまま渡すと javascript: スキームを踏まされる
// （React は href の javascript: を素通しする）。バックエンドでも同じ検査を
// しているが、多層防御としてフロント側でも入口で必ず通す。

function safeHttpUrl(raw: unknown): string {
  if (typeof raw !== "string" || raw === "") return "";
  try {
    const u = new URL(raw, window.location.origin);
    return u.protocol === "https:" || u.protocol === "http:" ? raw : "";
  } catch {
    return ""; // パースできない URL は使わない
  }
}

// sanitizeSite は 1 サイト分の結果を安全側に整える。
// URL が不正な商品は落とし、画像だけ不正なものは No Image 表示にフォールバックさせる。
function sanitizeSite(site: SiteResult): SiteResult {
  const items = Array.isArray(site.items) ? site.items : [];
  return {
    ...site,
    items: items
      .map((it) => ({ ...it, url: safeHttpUrl(it.url), image: safeHttpUrl(it.image) }))
      .filter((it) => it.url !== ""),
  };
}

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
  const data = (await res.json()) as SearchResponse;
  return { ...data, sites: (data.sites ?? []).map(sanitizeSite) };
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
      onSite(sanitizeSite(JSON.parse(trimmed) as SiteResult));
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

export type RankingPeriod = "day" | "month" | "year";

export type RankingResponse = {
  category: string;
  period: RankingPeriod | "";
  days: number;
  since: string; // 集計開始（JST, RFC3339）
  until: string; // 集計終了＝期間の終わり（進行中の期間では未来）
  items: RankingEntry[];
};

// fetchRankings はバックエンドの集計（ユーザーの実検索数）を取得する。
// period は暦の区切りでの集計期間（day=今日 / month=今月 / year=今年、JST 基準）。
// category は "all" または カテゴリ slug。DB 無効時はバックエンドが 503 を返すので
// null を返し、呼び出し側は静的シード（ranking.json）にフォールバックする。
export async function fetchRankings(
  category = "all",
  period: RankingPeriod = "month",
  limit = 20,
  signal?: AbortSignal
): Promise<RankingResponse | null> {
  const params = new URLSearchParams({
    category,
    period,
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

// ---- 検索ワードへのコメント ------------------------------------------------

export type Comment = {
  id: number;
  term: string;
  name: string; // 空文字 = 匿名（表示は絵文字アバター）
  link: string; // 空 / http(s) URL / mailto:
  body: string;
  createdAt: string; // RFC3339（JST）
};

export const COMMENT_MAX_BODY = 1024;
export const COMMENT_MAX_NAME = 32;

// バックエンドで検証・正規化済みのリンクだが、表示前にフロントでも必ず通す
// （多層防御。href に javascript: が来ても踏まないようにする）。
export function safeCommentLink(raw: unknown): string {
  if (typeof raw !== "string" || raw === "") return "";
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" || u.protocol === "mailto:"
      ? raw
      : "";
  } catch {
    return "";
  }
}

function sanitizeComment(c: Comment): Comment {
  return { ...c, link: safeCommentLink(c.link) };
}

// fetchComments は 1 検索ワードのコメントを新しい順に取得する。
// DB 無効時（503）やエラー時は null を返し、呼び出し側は「まだコメントがありません」
// ではなく取得失敗として扱う。
export async function fetchComments(
  term: string,
  limit = 50,
  signal?: AbortSignal
): Promise<{ count: number; items: Comment[] } | null> {
  const params = new URLSearchParams({ term, limit: String(limit) });
  try {
    const res = await fetch(`/api/comments?${params.toString()}`, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { count: number; items: Comment[] };
    return { count: data.count ?? 0, items: (data.items ?? []).map(sanitizeComment) };
  } catch {
    return null;
  }
}

// fetchCommentCounts は複数ワードのコメント件数をまとめて取得する（一覧のバッジ用）。
// 戻り値のキーは渡した語そのもの。取得できなければ空オブジェクト。
export async function fetchCommentCounts(
  terms: string[],
  signal?: AbortSignal
): Promise<Record<string, number>> {
  if (terms.length === 0) return {};
  const params = new URLSearchParams();
  terms.slice(0, 50).forEach((t) => params.append("term", t));
  try {
    const res = await fetch(`/api/comments/counts?${params.toString()}`, { signal });
    if (!res.ok) return {};
    const data = (await res.json()) as { counts?: Record<string, number> };
    return data.counts ?? {};
  } catch {
    return {};
  }
}

// postComment はコメントを投稿する。バリデーション/スパム判定はバックエンドが行い、
// 弾かれた理由は日本語のメッセージで返るのでそのまま表示する。
export async function postComment(input: {
  term: string;
  name: string;
  link: string;
  body: string;
}): Promise<Comment> {
  const res = await fetch("/api/comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? `投稿に失敗しました (${res.status})`);
  }
  return sanitizeComment(data.comment as Comment);
}
