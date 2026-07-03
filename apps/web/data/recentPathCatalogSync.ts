import {
  findRecentPathCatalogFile,
  getRecentFileEntries,
  getRecentPathForFileId,
  getRecentPathFromEntryId,
} from "./recentFiles";
import { ServerSync, type ServerFile } from "./ServerSync";

function pathsEqualForRecent(a: string, b: string): boolean {
  const left = a.trim();
  const right = b.trim();
  if (!left || !right) {
    return false;
  }
  if (left === right) {
    return true;
  }
  return (
    left.replace(/\//g, "\\").toLowerCase() ===
    right.replace(/\//g, "\\").toLowerCase()
  );
}

/** Match a catalog tree file to a recent path entry before path-resolve completes. */
export function findCatalogFileByAbsPath(
  absPath: string,
  filesById: ReadonlyMap<string, ServerFile>,
  pathByFileId?: Readonly<Record<string, string>>,
): ServerFile | null {
  const normalized = absPath.trim();
  if (!normalized) {
    return null;
  }
  for (const [fileId, file] of filesById) {
    const mapped = pathByFileId?.[fileId] ?? getRecentPathForFileId(fileId);
    if (mapped && pathsEqualForRecent(mapped, normalized)) {
      return file;
    }
  }
  return null;
}

/** Stable key for the current set of recent path entries (order-independent). */
export function fingerprintRecentAbsPaths(paths: readonly string[]): string {
  return paths
    .map((item) => item.trim().replace(/\//g, "\\").toLowerCase())
    .filter(Boolean)
    .sort()
    .join("\0");
}

export function collectRecentAbsPathsFromEntries(): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const entry of getRecentFileEntries()) {
    const absPath = getRecentPathFromEntryId(entry.id)?.trim();
    if (!absPath) {
      continue;
    }
    const key = absPath.replace(/\//g, "\\").toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    paths.push(absPath);
  }
  return paths;
}

function isNewerUpdatedAt(
  candidate: string | null | undefined,
  base: string | null | undefined,
): boolean {
  const candidateMs = candidate ? Date.parse(candidate) : Number.NaN;
  const baseMs = base ? Date.parse(base) : Number.NaN;
  return (
    Number.isFinite(candidateMs) &&
    (!Number.isFinite(baseMs) || candidateMs > baseMs)
  );
}

/**
 * Prefer catalog tree / prior resolve metadata so thumbnails are not reset.
 *
 * 易变元数据（updated_at/version/content_sha256/name）取「更新时间最新」的一侧：
 * path 解析结果是打开时的快照，保存后目录树/增量 patch 会更新——若让旧快照
 * 覆盖回去，列表排序键（effectiveUpdatedAt）在保存提交清掉 localEditTime 的
 * 瞬间会塌回旧时间，卡片被其他文件反超（「保存后跳位」）。
 */
export function mergeCatalogFileForRecentDisplay(
  resolved: ServerFile,
  opts?: {
    previous?: ServerFile | null;
    fromTree?: ServerFile | null;
  },
): ServerFile {
  const { previous = null, fromTree = null } = opts ?? {};
  const sameTree = fromTree?.id === resolved.id ? fromTree : null;
  const samePrev = previous?.id === resolved.id ? previous : null;
  const content_sha256 =
    resolved.content_sha256 ??
    sameTree?.content_sha256 ??
    samePrev?.content_sha256 ??
    null;
  const has_thumbnail =
    !!resolved.has_thumbnail ||
    !!sameTree?.has_thumbnail ||
    !!samePrev?.has_thumbnail;
  const merged: ServerFile = {
    ...(sameTree ?? samePrev ?? {}),
    ...resolved,
    content_sha256,
    has_thumbnail,
  };
  for (const candidate of [samePrev, sameTree]) {
    if (!candidate || !isNewerUpdatedAt(candidate.updated_at, merged.updated_at)) {
      continue;
    }
    merged.updated_at = candidate.updated_at;
    if (candidate.content_sha256) {
      merged.content_sha256 = candidate.content_sha256;
    }
    if (typeof candidate.version === "number") {
      merged.version = candidate.version;
    }
    if (candidate.name) {
      merged.name = candidate.name;
    }
  }
  return merged;
}

function recentDisplayMetadataChanged(a: ServerFile, b: ServerFile): boolean {
  return (
    a.has_thumbnail !== b.has_thumbnail ||
    a.content_sha256 !== b.content_sha256 ||
    a.updated_at !== b.updated_at ||
    a.version !== b.version ||
    a.name !== b.name
  );
}

export function mergeRecentPathCatalogFromTree(
  catalog: Readonly<Record<string, ServerFile>>,
  filesById: ReadonlyMap<string, ServerFile>,
): Record<string, ServerFile> {
  let changed = false;
  const next: Record<string, ServerFile> = { ...catalog };
  for (const [absPath, file] of Object.entries(catalog)) {
    const treeFile = filesById.get(file.id);
    if (!treeFile) {
      continue;
    }
    const merged = mergeCatalogFileForRecentDisplay(file, {
      previous: file,
      fromTree: treeFile,
    });
    if (recentDisplayMetadataChanged(merged, file)) {
      next[absPath] = merged;
      changed = true;
    }
  }
  return changed ? next : catalog;
}

export type RecentPathCatalogMetadataPatch = Partial<
  Pick<
    ServerFile,
    | "name"
    | "kind"
    | "has_thumbnail"
    | "content_sha256"
    | "version"
    | "updated_at"
  >
>;

/**
 * 保存完成等场景：按 fileId 就地覆盖 path-catalog 条目的易变元数据。
 * 覆盖不在主目录树里的「最近路径」文件——那类条目收不到 setFiles 的
 * 增量 patch，只有这里能把保存后的 updated_at/content_sha 写进排序与缩略图链路。
 */
export function patchRecentPathCatalogFileMetadata(
  catalog: Readonly<Record<string, ServerFile>>,
  fileId: string,
  patch: RecentPathCatalogMetadataPatch,
): Record<string, ServerFile> {
  const definedPatch = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<ServerFile>;
  if (Object.keys(definedPatch).length === 0) {
    return catalog as Record<string, ServerFile>;
  }
  let changed = false;
  const next: Record<string, ServerFile> = { ...catalog };
  for (const [absPath, file] of Object.entries(catalog)) {
    if (file.id !== fileId) {
      continue;
    }
    const merged = { ...file, ...definedPatch };
    if (recentDisplayMetadataChanged(merged, file)) {
      next[absPath] = merged;
      changed = true;
    }
  }
  return changed ? next : (catalog as Record<string, ServerFile>);
}

export function mergeRecentPathCatalogBatch(
  prev: Readonly<Record<string, ServerFile>>,
  paths: readonly string[],
  resolvedByPath: Readonly<Record<string, ServerFile>>,
  filesById: ReadonlyMap<string, ServerFile>,
  opts?: { replaceScope?: boolean },
): Record<string, ServerFile> {
  const replaceScope = opts?.replaceScope ?? false;
  const merged: Record<string, ServerFile> = replaceScope ? {} : { ...prev };
  for (const absPath of paths) {
    const resolvedFile = resolvedByPath[absPath];
    if (resolvedFile) {
      const prevMatch = findRecentPathCatalogFile(prev, absPath);
      merged[absPath] = mergeCatalogFileForRecentDisplay(resolvedFile, {
        previous: prevMatch?.file ?? null,
        fromTree: filesById.get(resolvedFile.id) ?? null,
      });
      continue;
    }
    const prevMatch = findRecentPathCatalogFile(prev, absPath);
    if (prevMatch) {
      merged[prevMatch.key] = mergeCatalogFileForRecentDisplay(prevMatch.file, {
        fromTree: filesById.get(prevMatch.file.id) ?? null,
      });
    }
  }
  return merged;
}

export async function resolveRecentPathCatalogByPaths(
  paths: readonly string[],
): Promise<{
  resolvedByPath: Record<string, ServerFile>;
  failures: Record<string, true>;
}> {
  const resolvedByPath: Record<string, ServerFile> = {};
  const failures: Record<string, true> = {};
  for (const absPath of paths) {
    try {
      const resolved = await ServerSync.resolveCatalogFileByPath(absPath);
      resolvedByPath[absPath] = resolved.file;
    } catch {
      failures[absPath] = true;
    }
  }
  return { resolvedByPath, failures };
}
