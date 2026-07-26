// Cloudflare Pages Function: proxies every /api/* request from item-search.jp
// to the Go backend (item-search.net), injecting a secret header that the
// backend requires. The secret lives only in Cloudflare env vars, never in the
// browser, so only requests routed through this frontend can reach the backend.
//
// Required Pages environment variables (Settings → Environment variables):
//   BACKEND_ORIGIN  e.g. https://item-search.net   (no trailing slash)
//   PROXY_SECRET    same value as the backend's PROXY_SECRET
//   SEARCH_CACHE_TTL (optional) edge cache seconds for search responses (default 120)
//
// Path matching: functions/api/[[path]].ts catches /api/* (search, sites, health…).
//
// Edge caching: GET /api/search と /api/search/stream の結果を Cloudflare エッジに
// TTL 秒キャッシュする。人気クエリはエッジで ~20ms 返り、トンネルもローカル Mac も
// 外部 API も叩かない。キャッシュキーは URL（q/limit/sites を含む）のみで、
// X-Proxy-Secret 等のヘッダには依存しない（検索結果はユーザ非依存のため共有可）。

interface Env {
  BACKEND_ORIGIN: string;
  PROXY_SECRET: string;
  SEARCH_CACHE_TTL?: string;
}

// エッジキャッシュ対象のパス（GET のみ）。
const CACHEABLE = new Set(["/api/search", "/api/search/stream"]);

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (!env.BACKEND_ORIGIN || !env.PROXY_SECRET) {
    return new Response(
      JSON.stringify({ error: "backend proxy not configured" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  const incoming = new URL(request.url);
  const cacheable = request.method === "GET" && CACHEABLE.has(incoming.pathname);

  // エッジキャッシュのキーは URL（クエリ込み）だけで作る。ヘッダ差でキャッシュが
  // 分裂しないよう、素の GET Request を鍵にする。
  const cache = caches.default;
  const cacheKey = cacheable
    ? new Request(new URL(incoming.pathname + incoming.search, incoming.origin).toString(), {
        method: "GET",
      })
    : null;

  if (cacheKey) {
    const hit = await cache.match(cacheKey);
    if (hit) {
      const res = new Response(hit.body, hit);
      res.headers.set("X-Edge-Cache", "HIT");
      return res;
    }
  }

  // Preserve the original path (/api/...) and query string.
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

  const upstream = await fetch(target.toString(), init);

  // 非キャッシュ対象、またはエラー応答はそのまま返す。
  if (!cacheKey || !upstream.ok || !upstream.body) {
    return upstream;
  }

  // ストリームを 2 分岐: 一方はクライアントへ即時（段階返却を維持）、
  // もう一方はエッジキャッシュへ非同期に格納する。
  const ttl = Number(env.SEARCH_CACHE_TTL ?? "120") || 120;
  const [toClient, toCache] = upstream.body.tee();

  const clientRes = new Response(toClient, upstream);
  clientRes.headers.set("X-Edge-Cache", "MISS");

  const cacheRes = new Response(toCache, upstream);
  // 保存用は明示的に TTL を付ける（origin の no-cache 等に依存しない）。
  cacheRes.headers.set("Cache-Control", `public, max-age=${ttl}`);
  cacheRes.headers.delete("set-cookie");

  context.waitUntil(cache.put(cacheKey, cacheRes));

  return clientRes;
};
