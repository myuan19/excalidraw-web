import type {
  CatalogScanStatus,
  FileTreeResponse,
  ServerFolder,
} from "./ServerSync";

/** Desktop folderMapping 后台扫描：仅校验元数据，不发现新文件。 */
export const DESKTOP_CATALOG_PASS_STAT_ONLY = "stat-only";

const NOTICE_INDEXING =
  "正在后台索引本地文件夹，文件会陆续出现…";
const NOTICE_VALIDATING = "正在校验本地文件夹…";

export function countCatalogPendingFiles(
  tree?: FileTreeResponse | null,
): number {
  if (!tree?.files?.length) {
    return 0;
  }
  let pending = 0;
  for (const file of tree.files) {
    if (file.scan_pending || file.health === "pending") {
      pending += 1;
    }
  }
  return pending;
}

/**
 * Desktop：stat-only 校验在后台静默运行；仅在有 pending 或深度扫描时提示用户。
 * Web：沿用 running → 索引提示。
 */
export function deriveDesktopCatalogScanNotice(
  scan?: CatalogScanStatus | null,
  tree?: FileTreeResponse | null,
): string | null {
  if (scan?.state === "error") {
    return scan.error ?? "本地文件夹索引失败";
  }
  const running = scan?.state === "running" || scan?.running;
  if (!running) {
    return null;
  }
  if (scan?.pass === DESKTOP_CATALOG_PASS_STAT_ONLY) {
    const pending = countCatalogPendingFiles(tree);
    return pending > 0 ? NOTICE_VALIDATING : null;
  }
  return NOTICE_INDEXING;
}

export function deriveCatalogScanNoticeForRuntime(
  scan?: CatalogScanStatus | null,
  tree?: FileTreeResponse | null,
  isDesktop = false,
): string | null {
  if (isDesktop) {
    return deriveDesktopCatalogScanNotice(scan, tree);
  }
  if (scan?.state === "running" || scan?.running) {
    return NOTICE_INDEXING;
  }
  if (scan?.state === "error") {
    return scan.error ?? "本地文件夹索引失败";
  }
  return null;
}

/** 按映射根文件夹 basename 匹配默认数据目录（单根时可靠）。 */
export function findDefaultDataDirectoryFolderId(
  folders: ServerFolder[],
  absPath: string,
): string | null {
  const normalized = absPath.trim().replace(/\\/g, "/");
  const basename = normalized.split("/").filter(Boolean).pop()?.toLowerCase();
  if (!basename) {
    return null;
  }
  const roots = folders.filter(
    (folder) =>
      folder.is_mapping_root && folder.name.toLowerCase() === basename,
  );
  if (roots.length === 1) {
    return roots[0].id;
  }
  return null;
}
