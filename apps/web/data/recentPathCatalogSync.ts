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

/** Prefer catalog tree / prior resolve metadata so thumbnails are not reset. */
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
  return {
    ...(sameTree ?? samePrev ?? {}),
    ...resolved,
    content_sha256,
    has_thumbnail,
  };
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
    if (
      merged.has_thumbnail !== file.has_thumbnail ||
      merged.content_sha256 !== file.content_sha256
    ) {
      next[absPath] = merged;
      changed = true;
    }
  }
  return changed ? next : catalog;
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
