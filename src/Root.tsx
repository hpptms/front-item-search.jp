import App from "./App";
import About from "./pages/About";
import Terms from "./pages/Terms";
import { usePathname } from "./router";

// pathname に応じてトップ（検索UI）または静的ページを描画する最上位コンポーネント。
export default function Root() {
  const pathname = usePathname();

  switch (pathname) {
    case "/about":
      return <About />;
    case "/terms":
      return <Terms />;
    default:
      return <App />;
  }
}
