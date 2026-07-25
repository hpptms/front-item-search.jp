import { useEffect, useState } from "react";

// react-router を入れずに済む、ごく軽量なパスベースのルーター。
// ページ数が少ない（トップ / 利用規約 / サイトの説明）ため、
// History API と popstate だけで完結させている。
// 直リンク / リロードは Cloudflare Pages の SPA フォールバック（public/_redirects）で
// index.html に返してから、このルーターが pathname を見て描画する。

export function navigate(path: string) {
  if (window.location.pathname === path) return;
  window.history.pushState({}, "", path);
  // pushState は popstate を発火しないので、購読側へ手動で通知する。
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}

// 現在の pathname を購読するフック。ブラウザの戻る / 進むにも追従する。
export function usePathname(): string {
  const [pathname, setPathname] = useState(
    () => window.location.pathname
  );
  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname);
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
      href={to}
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
