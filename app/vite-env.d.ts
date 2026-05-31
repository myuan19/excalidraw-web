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
  /** Set by debug-ship build: enable all devDebug channels + debug logger + remote ingest. */
  readonly VITE_APP_DEPLOY_DEBUG?: string;
  readonly VITE_APP_ENABLE_EDITOR_OPEN_DEBUG?: string;
  readonly VITE_APP_ENABLE_MINDMAP_DEBUG?: string;
  readonly VITE_APP_ENABLE_EMBED_DEBUG?: string;
  readonly VITE_APP_ENABLE_APP_DEBUG?: string;
  readonly VITE_APP_ENABLE_AI_CONFIG_DEBUG?: string;
  readonly VITE_APP_ENABLE_FILE_LIST_DEBUG?: string;
  readonly VITE_APP_ENABLE_THUMBNAIL_DEBUG?: string;
}

declare global {
  interface Window {
    __EXCALIDRAW_EMBED_MODE__?: boolean;
  }
}

export {};
