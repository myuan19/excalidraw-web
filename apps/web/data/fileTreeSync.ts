import { ServerSync } from "./ServerSync";
import type { CatalogScanStatus, FileTreeResponse } from "./ServerSync";

const CATALOG_SCAN_NOTICE_RUNNING =
  "正在后台索引本地文件夹，文件会陆续出现…";

/** 目录列表指纹（不含 scan / 缩略图计数），用于跳过无实质变化的 apply。 */
export function fingerprintCatalogListing(tree: FileTreeResponse): string {
  let maxUpdated = "";
  for (const file of tree.files) {
    if (file.updated_at && file.updated_at > maxUpdated) {
      maxUpdated = file.updated_at;
    }
  }
  for (const folder of tree.folders) {
    if (folder.updated_at && folder.updated_at > maxUpdated) {
      maxUpdated = folder.updated_at;
    }
  }
  let pendingCount = 0;
  for (const file of tree.files) {
    if (file.scan_pending || file.health === "pending") {
      pendingCount += 1;
    }
  }
  const caps = tree.capabilities;
  const capKey = caps
    ? `${caps.folderMapping ? 1 : 0}${caps.addMappedFolder ? 1 : 0}${caps.archivesEnabled ? 1 : 0}`
    : "";
  return [
    tree.folders.length,
    tree.files.length,
    pendingCount,
    maxUpdated,
    capKey,
  ].join("|");
}

/** 含 scan 进度的完整指纹，供测试与诊断对比。 */
export function fingerprintFileTree(tree: FileTreeResponse): string {
  const scan = tree.scan;
  return [
    fingerprintCatalogListing(tree),
    scan?.state ?? "",
    scan?.running ? 1 : 0,
    scan?.pass ?? "",
    scan?.processed ?? "",
  ].join("|");
}

export function deriveCatalogScanNotice(
  scan?: CatalogScanStatus | null,
): string | null {
  if (scan?.state === "running" || scan?.running) {
    return CATALOG_SCAN_NOTICE_RUNNING;
  }
  if (scan?.state === "error") {
    return scan.error ?? "本地文件夹索引失败";
  }
  return null;
}

export function mergeExpandedFolderState(
  prev: Record<string, boolean>,
  folders: FileTreeResponse["folders"],
): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const folder of folders) {
    if (prev[folder.id] !== undefined) {
      next[folder.id] = prev[folder.id];
    }
  }
  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);
  if (
    prevKeys.length === nextKeys.length &&
    prevKeys.every((key) => prev[key] === next[key])
  ) {
    return prev;
  }
  return next;
}

/** 合并 catalog SSE 触发，避免索引完成时连续 refresh。 */
export function subscribeDebouncedCatalogChanges(
  onChange: () => void,
  debounceMs = 800,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ServerSync.subscribeCatalogChanges(() => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, debounceMs);
  });
}
