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
      },
    },
  },
});
