import { SIDECAR_DIR, isDocumentFile } from "./sidecar.js";

/** 监听器路径中始终忽略的目录段（不参与索引触发）。 */
const IGNORED_PATH_SEGMENTS = new Set([
  SIDECAR_DIR,
  ".git",
  "node_modules",
  "$recycle.bin",
  "System Volume Information",
]);

/**
 * 规范化 fs.watch 回调里的相对路径。
 * @param {string | null | undefined} fileName
 */
export function normalizeWatchPath(fileName) {
  return String(fileName ?? "")
    .split(/[\\/]+/)
    .filter(Boolean)
    .join("/");
}

export function isSidecarWatchPath(fileName) {
  return normalizeWatchPath(fileName)
    .split("/")
    .includes(SIDECAR_DIR);
}

function hasIgnoredSegment(relPath) {
  const segments = normalizeWatchPath(relPath).split("/").filter(Boolean);
  return segments.some((segment) => IGNORED_PATH_SEGMENTS.has(segment));
}

/**
 * 是否应对 watcher 事件触发 catalog 重扫。
 * - 空路径（Windows 常见）忽略
 * - sidecar / VCS / 依赖目录忽略
 * - 有扩展名且非 EditorHub 文档类型的文件忽略（如 .zip、.log）
 * - 无扩展名路径视为目录变更，保留
 */
export function shouldScheduleRescanForWatchPath(relPath) {
  const normalized = normalizeWatchPath(relPath);
  if (!normalized) {
    return false;
  }
  if (isSidecarWatchPath(normalized)) {
    return false;
  }
  if (hasIgnoredSegment(normalized)) {
    return false;
  }
  const basename = normalized.split("/").pop() ?? "";
  if (!basename.includes(".")) {
    return true;
  }
  return isDocumentFile(basename);
}
