/**
 * Development-only console diagnostics for @excalidraw/* packages.
 * In production builds (import.meta.env.DEV === false) calls are no-ops and
 * should be dropped by the bundler.
 */

const devConsoleDebugImpl = import.meta.env.DEV
  ? (scope: string, label: string, data?: unknown) => {
      if (data !== undefined) {
        console.log(`[DEBUG] ${scope} | ${label}`, data);
      } else {
        console.log(`[DEBUG] ${scope} | ${label}`);
      }
    }
  : (_scope: string, _label: string, _data?: unknown) => {};

/** Optional runtime override: localStorage `excalidraw-dev-console-debug=1` */
export function devConsoleDebug(
  scope: string,
  label: string,
  data?: unknown,
): void {
  if (!import.meta.env.DEV) {
    try {
      if (
        typeof localStorage !== "undefined" &&
        localStorage.getItem("excalidraw-dev-console-debug") === "1"
      ) {
        console.log(`[DEBUG] ${scope} | ${label}`, data ?? "");
        return;
      }
    } catch {
      /* ignore */
    }
    return;
  }
  devConsoleDebugImpl(scope, label, data);
}
