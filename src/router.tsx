import { useEffect, useState } from "react";

// react-router を入れずに済む、ごく軽量なパスベースのルーター。
// ページ数が少ない（トップ / 利用規約 / サイトの説明）ため、
// History API と popstate だけで完結させている。
// 直リンク / リロードは Cloudflare Pages の SPA フォールバック（public/_redirects）で
// index.html に返してから、このルーターが pathname を見て描画する。

// 末尾スラッシュ付きに正規化する（クエリ / ハッシュは保つ）。
// Cloudflare Pages は dist/<path>/index.html を「/<path>/」で配信し、スラッシュ無しの
// アクセスは 308 でスラッシュ付きへ飛ばす。サイト内リンクと canonical をスラッシュ付きに
// 揃えることで、無駄なリダイレクトと canonical の不一致を無くす。
// scripts/prerender.mjs にも同じ関数がある（静的 HTML 側の生成用）。
export function withSlash(path: string): string {
  const [, p = path, rest = ""] = path.match(/^([^?#]*)([?#].*)?$/) ?? [];
  if (p === "" || p === "/") return "/" + rest;
  return (p.endsWith("/") ? p : p + "/") + rest;
}

// 末尾スラッシュを落とした比較用のパス。ルート判定はこちらの形に揃える
// （ROUTE_SEO のキーや Root.tsx の switch は "/about" 形式のため）。
export function normalizePath(pathname: string): string {
  return pathname !== "/" && pathname.endsWith("/")
    ? pathname.replace(/\/+$/, "")
    : pathname;
}

export function navigate(path: string) {
  const target = withSlash(path);
  if (window.location.pathname + window.location.search === target) return;
  window.history.pushState({}, "", target);
  // pushState は popstate を発火しないので、購読側へ手動で通知する。
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}

// 現在の pathname を購読するフック。ブラウザの戻る / 進むにも追従する。
// 末尾スラッシュは落として返すので、購読側は "/about" 形式だけを見ればよい。
export function usePathname(): string {
  const [pathname, setPathname] = useState(() =>
    normalizePath(window.location.pathname)
  );
  useEffect(() => {
    const onPop = () => setPathname(normalizePath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return pathname;
}

// アンカーとして振る舞いつつ、フルリロードせずに SPA 内遷移するリンク。
export function Link({
  to,
  children,
  ...rest
}: {
  to: string;
  children: React.ReactNode;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <a
      href={withSlash(to)}
      onClick={(e) => {
        // 修飾キー付き（新しいタブで開く等）はブラウザ既定に任せる。
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
