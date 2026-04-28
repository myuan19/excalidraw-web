/// <reference types="vite-plugin-pwa/vanillajs" />
/// <reference types="vite-plugin-pwa/info" />
/// <reference types="vite-plugin-svgr/client" />
/// <reference path="../packages/excalidraw/vite-env.d.ts" />

interface ImportMetaEnv {
  /** Optional public API base for the private server (same-origin default). */
  readonly VITE_APP_API_BASE?: string;
  /** Default on; set "0" at build time to disable POST /api/client-logs. */
  readonly VITE_APP_CLIENT_LOG_TO_SERVER?: string;
  readonly VITE_APP_DISABLE_PREVENT_UNLOAD?: string;
}
