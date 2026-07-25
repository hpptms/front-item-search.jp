import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // listen on 0.0.0.0 so the container is reachable
    port: 5173,
    watch: {
      usePolling: true, // reliable file watching inside Docker
    },
    // Proxy API calls to the Go backend during development.
    // ローカル起動は localhost、Docker は compose で VITE_PROXY_TARGET=http://backend:8080 を渡す。
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET || "http://localhost:8080",
        changeOrigin: true,
        // 本番の Cloudflare Pages Function と同様に、バックエンドの共有秘密ヘッダを
        // 付与する。PROXY_SECRET が設定されている（= ゲート有効）ときのみ注入する。
        // これにより localhost だけでなく LAN の IP からアクセスしても API が通る。
        configure: (proxy) => {
          const secret = process.env.PROXY_SECRET;
          if (secret) {
            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.setHeader("X-Proxy-Secret", secret);
            });
          }
        },
      },
    },
  },
});
