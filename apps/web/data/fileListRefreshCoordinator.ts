/** 文件列表静默刷新防抖窗口（catalog IPC 与 file-list-refresh 共用）。 */
export const FILE_LIST_SILENT_REFRESH_DEBOUNCE_MS = 600;

/** 增量保存后跳过全量 tree 拉取的时间窗。 */
export const FILE_LIST_INCREMENTAL_SAVE_SKIP_MS = 2000;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingRun: (() => void) | null = null;

let recentIncrementalSave: { fileId: string; at: number } | null = null;

export function markFileListIncrementalSave(fileId: string): void {
  recentIncrementalSave = { fileId, at: Date.now() };
}

export function shouldSkipSilentTreeRefreshAfterIncrementalSave(
  fileId?: string | null,
): boolean {
  if (!recentIncrementalSave) {
    return false;
  }
  if (Date.now() - recentIncrementalSave.at > FILE_LIST_INCREMENTAL_SAVE_SKIP_MS) {
    recentIncrementalSave = null;
    return false;
  }
  if (fileId && recentIncrementalSave.fileId !== fileId) {
    return false;
  }
  return true;
}

export function clearFileListIncrementalSaveSkip(): void {
  recentIncrementalSave = null;
}

export function scheduleDebouncedFileListRefresh(run: () => void): void {
  pendingRun = run;
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    const fn = pendingRun;
    pendingRun = null;
    fn?.();
  }, FILE_LIST_SILENT_REFRESH_DEBOUNCE_MS);
}

export function cancelDebouncedFileListRefresh(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  pendingRun = null;
}
