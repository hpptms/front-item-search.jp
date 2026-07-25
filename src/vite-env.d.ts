/// <reference types="vite/client" />

// Google Analytics (GA4) の gtag。index.html で読み込んでいる。
declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

export {};
