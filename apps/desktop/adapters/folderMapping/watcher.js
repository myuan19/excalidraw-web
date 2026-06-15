/**
 * Future desktop integration point for external file changes.
 *
 * The first implementation scans the workspace on every files API call. That
 * keeps the mapping deterministic while avoiding long-running watcher lifecycle
 * concerns before the Electron/Tauri shell exists.
 */
export function createWorkspaceWatcher() {
  return {
    close() {
      // no-op for the scan-on-demand implementation
    },
  };
}
