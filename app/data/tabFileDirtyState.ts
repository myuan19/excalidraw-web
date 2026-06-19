/**
 * 标签页本地的「未保存修改」注册表。
 *
 * FileSyncState 的 draft/baseline hash 存在 localStorage，同源所有标签共享，
 * 无法回答「当前这个标签页有没有自己的未保存修改」——内容哈希也区分不了
 * 「我改了」和「服务器前进了」。跨页自动刷新的冲突判定需要的恰恰是页内
 * 状态：纯内存、每个标签页独立。
 *
 * 埋点约定：编辑器在自己已有的脏判定处 mark/clear（编辑标脏、保存成功/
 * 与基线对齐/从服务器重载时清除），本模块不做任何判定。
 */
import { createLogger } from "../lib/logger";

import { getClientTabId } from "./clientRequestContext";

const log = createLogger({ module: "tabDirty" });

const dirtyFileIds = new Set<string>();

export function markTabFileDirty(fileId: string): void {
  const wasDirty = dirtyFileIds.has(fileId);
  dirtyFileIds.add(fileId);
  log.info("mark", {
    clientTabId: getClientTabId(),
    fileId8: fileId.slice(0, 8),
    wasDirty,
    dirtyCount: dirtyFileIds.size,
  });
}

export function clearTabFileDirty(fileId: string): void {
  const wasDirty = dirtyFileIds.has(fileId);
  dirtyFileIds.delete(fileId);
  log.info("clear", {
    clientTabId: getClientTabId(),
    fileId8: fileId.slice(0, 8),
    wasDirty,
    dirtyCount: dirtyFileIds.size,
  });
}

export function isTabFileDirty(fileId: string | null | undefined): boolean {
  return !!fileId && dirtyFileIds.has(fileId);
}
