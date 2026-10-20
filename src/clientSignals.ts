// 不正アクセス検知用にバックエンドへ渡す識別子（backend/internal/api/guard.go）。
//
//   X-Client-Device … localStorage に保存する乱数 ID。同じ ID が短時間に多数の IP から
//                     来たら「プロキシを回して IP 制限を逃れている」と判断して遮断される。
//   X-Client-FP     … ブラウザ環境（canvas 描画 / WebGL / 画面 / 言語 / タイムゾーン等）の
//                     ハッシュ。ストレージを使い捨てるボットでも同じ環境なら一致する。
//
// どちらも個人を特定する情報は含まず、サーバ側でもメモリに一時保持するだけ。
// 取得に失敗しても検索は普通に動く（ヘッダを付けないだけ）。

const DEVICE_KEY = "serch.device";

let cached: Record<string, string> | null = null;

export function clientSignalHeaders(): Record<string, string> {
  if (cached) return cached;
  const h: Record<string, string> = {};
  const dev = deviceId();
  if (dev) h["X-Client-Device"] = dev;
  const fp = fingerprint();
  if (fp) h["X-Client-FP"] = fp;
  cached = h;
  return h;
}

function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id || !/^[0-9a-f-]{16,64}$/.test(id)) {
      id = randomHex(16);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return ""; // プライベートモード等で localStorage が使えない
  }
}

function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fingerprint(): string {
  if (typeof document === "undefined") return "";
  const parts: string[] = [];
  const add = (f: () => unknown) => {
    try {
      parts.push(String(f()));
    } catch {
      parts.push("");
    }
  };

  add(() => navigator.platform);
  add(() => (navigator.languages ?? [navigator.language]).join(","));
  add(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  add(() => new Date().getTimezoneOffset());
  add(() => navigator.hardwareConcurrency);
  add(() => (navigator as Navigator & { deviceMemory?: number }).deviceMemory);
  add(() => navigator.maxTouchPoints);
  add(() => [screen.width, screen.height, screen.colorDepth, window.devicePixelRatio].join("x"));
  add(canvasSignal);
  add(webglSignal);

  const s = parts.join("|");
  return hash32(s, 0x9e3779b9) + hash32(s, 0x85ebca6b) + hash32(s, 0xc2b2ae35) + hash32(s, 0x27d4eb2f);
}

// 同じ描画命令でも GPU / フォント / アンチエイリアスの差で結果が変わる。
function canvasSignal(): string {
  const c = document.createElement("canvas");
  c.width = 240;
  c.height = 60;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  ctx.textBaseline = "top";
  ctx.font = "16px 'Arial', sans-serif";
  ctx.fillStyle = "#f60";
  ctx.fillRect(100, 1, 62, 20);
  ctx.fillStyle = "#069";
  ctx.fillText("item-search 価格比較 😃", 2, 15);
  ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
  ctx.fillText("item-search 価格比較 😃", 4, 17);
  ctx.beginPath();
  ctx.arc(50, 30, 20, 0, Math.PI * 2);
  ctx.stroke();
  return hash32(c.toDataURL(), 1);
}

function webglSignal(): string {
  const c = document.createElement("canvas");
  const gl = c.getContext("webgl") as WebGLRenderingContext | null;
  if (!gl) return "";
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
  const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  return [vendor, renderer, gl.getParameter(gl.MAX_TEXTURE_SIZE)].join("/");
}

// 暗号学的な強度は不要（衝突しにくい識別子が欲しいだけ）。
function hash32(s: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x5bd1e995);
    h ^= h >>> 15;
  }
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0).toString(16).padStart(8, "0");
}
