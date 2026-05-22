/// <reference types="vite-plugin-pwa/vanillajs" />
/// <reference types="vite-plugin-pwa/info" />
/// <reference types="vite-plugin-svgr/client" />
/// <reference path="../packages/excalidraw/vite-env.d.ts" />

interface ImportMetaEnv {
  /** Optional public API base for the private server (same-origin default). */
  readonly VITE_APP_API_BASE?: string;
  readonly VITE_APP_DISABLE_PREVENT_UNLOAD?: string;
  /** Minimum level for browser console (`debug` | `info` | `warn` | `error`). */
  readonly VITE_LOG_LEVEL?: string;
  /** If `"0"`, disable POST /api/logs remote transport. */
  readonly VITE_LOG_REMOTE?: string;
}

declare global {
  interface Window {
    __EXCALIDRAW_EMBED_MODE__?: boolean;
  }
}

export {};
