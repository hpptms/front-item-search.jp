// Cloudflare Pages Function: proxies every /api/* request from item-search.jp
// to the Go backend (item-search.net), injecting a secret header that the
// backend requires. The secret lives only in Cloudflare env vars, never in the
// browser, so only requests routed through this frontend can reach the backend.
//
// Required Pages environment variables (Settings → Environment variables):
//   BACKEND_ORIGIN  e.g. https://item-search.net   (no trailing slash)
//   PROXY_SECRET    same value as the backend's PROXY_SECRET
//
// Path matching: functions/api/[[path]].ts catches /api/* (search, sites, health…).
//
// キャッシュはバックエンド側（プロバイダ単位の TTL キャッシュ・エラー/空結果は
// 非キャッシュ）に一本化している。ここでエッジキャッシュ（caches.default）を
// かけると、ストリーミング応答の部分的なエラー/空結果も 200 OK として丸ごと
// 固定してしまい「0 件」を配り続ける事故が起きるため、あえて素通しにする。

interface Env {
  BACKEND_ORIGIN: string;
  PROXY_SECRET: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (!env.BACKEND_ORIGIN || !env.PROXY_SECRET) {
    return new Response(
      JSON.stringify({ error: "backend proxy not configured" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  // Preserve the original path (/api/...) and query string.
  const incoming = new URL(request.url);
  const target = new URL(env.BACKEND_ORIGIN);
  target.pathname = incoming.pathname;
  target.search = incoming.search;

  // Forward the request, adding the secret header.
  const headers = new Headers(request.headers);
  headers.set("X-Proxy-Secret", env.PROXY_SECRET);
  // Drop hop-by-hop / origin-revealing headers that shouldn't be forwarded.
  headers.delete("host");

  const init: RequestInit = {
    method: request.method,
    headers,
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : request.body,
    redirect: "manual",
  };

  return fetch(target.toString(), init);
};
