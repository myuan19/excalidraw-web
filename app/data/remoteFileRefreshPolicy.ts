export type RemoteFileRefreshDecision = "ignore" | "reload" | "prompt";

/**
 * 其他标签页保存了当前文件时，本页如何响应。
 *
 * - `reload`：本页没有自己的未保存修改，直接刷成服务器版本
 * - `prompt`：本页有未保存修改，弹确认框让用户选择加载/保留
 * - `ignore`：与本页无关，或用户已对同一版本选择过「保留当前修改」
 *
 * `tabHasUnsavedChanges` 必须是标签页本地状态（tabFileDirtyState），
 * 不能用跨标签共享的 FileSyncState 哈希——那会被保存方标签污染。
 */
export function decideRemoteFileRefresh(opts: {
  currentFileId: string | null | undefined;
  savedFileId: string | null | undefined;
  tabHasUnsavedChanges: boolean;
  savedSha?: string | null;
  dismissedSha?: string | null;
}): RemoteFileRefreshDecision {
  if (!opts.currentFileId || opts.currentFileId !== opts.savedFileId) {
    return "ignore";
  }
  if (!opts.tabHasUnsavedChanges) {
    return "reload";
  }
  if (opts.savedSha && opts.savedSha === opts.dismissedSha) {
    return "ignore";
  }
  return "prompt";
}
