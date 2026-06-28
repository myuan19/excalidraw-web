import { traceUserAction } from "../lib/userTrace";

/**
 * Recent list storage — single write path: touchRecentOpenedFile / touchRecentTrackedFiles.
 * Opening a document in the editor records recent via openEditorFileTab (editorTabNavigation).
 * Edit activity bumps via touchRecentOpenedFile from editSessionService / localDraftSessions.
 * Draft → catalog promotion uses promoteRecentCatalogFile.
 */

export const RECENT_FILES_KEY = "editorhub-recent-files-v1";
export const RECENT_FILE_PATHS_KEY = "editorhub-recent-file-paths-v1";
export const RECENT_FILES_CHANGE_EVENT = "editorhub-recent-files-change";
export const RECENT_PATH_PREFIX = "path:";

const RECENT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const RECENT_EDIT_BUMP_THROTTLE_MS = 2500;
const recentEditBumpAtByKey = new Map<string, number>();

export type RecentFileEntry = {
  id: string;
  accessedAt: string;
};

function readEntries(): RecentFileEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_FILES_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (item): item is RecentFileEntry =>
        !!item &&
        typeof item === "object" &&
        typeof (item as RecentFileEntry).id === "string" &&
        typeof (item as RecentFileEntry).accessedAt === "string",
    );
  } catch {
    return [];
  }
}

function readRecentPathByFileId(): Record<string, string> {
  try {
    const raw = localStorage.getItem(RECENT_FILE_PATHS_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function writeRecentPathByFileId(map: Record<string, string>): void {
  try {
    localStorage.setItem(RECENT_FILE_PATHS_KEY, JSON.stringify(map));
  } catch {
    // best-effort
  }
}

function rememberRecentPathForFileId(fileId: string, absPath: string): void {
  const normalized = absPath.trim();
  if (!fileId || !normalized) {
    return;
  }
  const next = { ...readRecentPathByFileId(), [fileId]: normalized };
  writeRecentPathByFileId(next);
}

export function getRecentPathForFileId(fileId: string): string | null {
  const mapped = readRecentPathByFileId()[fileId]?.trim();
  return mapped || null;
}

function pruneEntries(entries: RecentFileEntry[]): RecentFileEntry[] {
  const cutoff = Date.now() - RECENT_WINDOW_MS;
  return entries.filter(
    (entry) => new Date(entry.accessedAt).getTime() >= cutoff,
  );
}

function writeEntries(entries: RecentFileEntry[]) {
  const pruned = pruneEntries(entries);
  try {
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(pruned));
    window.dispatchEvent(new CustomEvent(RECENT_FILES_CHANGE_EVENT));
  } catch {
    // best-effort
  }
}

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

/** 在 path-keyed catalog 映射中按路径查找（Windows 大小写/斜杠不敏感）。 */
export function findRecentPathCatalogFile<T extends { id: string }>(
  catalog: Readonly<Record<string, T>>,
  absPath: string,
): { key: string; file: T } | null {
  const normalized = absPath.trim();
  if (!normalized) {
    return null;
  }
  const direct = catalog[normalized];
  if (direct) {
    return { key: normalized, file: direct };
  }
  for (const [key, file] of Object.entries(catalog)) {
    if (pathsEqualForRecent(key, normalized)) {
      return { key, file };
    }
  }
  return null;
}

function entryMatchesOpenedFile(
  entry: RecentFileEntry,
  fileId: string,
  normalizedPath: string | null,
  pathEntryId: string | null,
): boolean {
  if (entry.id === fileId || entry.id === pathEntryId) {
    return true;
  }
  if (normalizedPath && isRecentPathEntry(entry.id)) {
    const entryPath = getRecentPathFromEntryId(entry.id);
    if (entryPath && pathsEqualForRecent(entryPath, normalizedPath)) {
      return true;
    }
  }
  const mappedPath = fileId ? getRecentPathForFileId(fileId) : null;
  if (mappedPath && isRecentPathEntry(entry.id)) {
    const entryPath = getRecentPathFromEntryId(entry.id);
    if (entryPath && pathsEqualForRecent(entryPath, mappedPath)) {
      return true;
    }
  }
  return false;
}

/** 编辑活动时将文件 bump 到最近列表顶部（节流，避免拖动时每帧写 localStorage）。 */
export function bumpRecentEditOrder(
  opts: {
    fileId?: string | null;
    absPath?: string | null;
  },
  bumpOpts?: { force?: boolean },
): void {
  const fileId = opts.fileId?.trim() || null;
  const absPath =
    opts.absPath?.trim() || (fileId ? getRecentPathForFileId(fileId) : null) || null;
  const throttleKey = fileId ?? absPath;
  if (!throttleKey) {
    return;
  }
  const now = Date.now();
  if (!bumpOpts?.force) {
    const last = recentEditBumpAtByKey.get(throttleKey) ?? 0;
    if (now - last < RECENT_EDIT_BUMP_THROTTLE_MS) {
      return;
    }
  }
  recentEditBumpAtByKey.set(throttleKey, now);
  touchRecentOpenedFile({ fileId, absPath });
}

/** 写入或置顶最近条目；合并 path / catalog id 重复项。 */
export function touchRecentOpenedFile(opts: {
  fileId?: string | null;
  absPath?: string | null;
}): void {
  const fileId = opts.fileId?.trim() || null;
  const normalizedPath =
    opts.absPath?.trim() || (fileId ? getRecentPathForFileId(fileId) : null) || null;
  if (!fileId && !normalizedPath) {
    return;
  }
  if (fileId && normalizedPath) {
    rememberRecentPathForFileId(fileId, normalizedPath);
  }
  const pathEntryId = normalizedPath
    ? toRecentPathEntryId(normalizedPath)
    : null;
  const primaryId = pathEntryId ?? fileId!;
  const prunedExisting = pruneEntries(readEntries());
  const now = new Date().toISOString();
  const next = [
    { id: primaryId, accessedAt: now },
    ...prunedExisting.filter(
      (entry) =>
        !entryMatchesOpenedFile(
          entry,
          fileId ?? "",
          normalizedPath,
          pathEntryId,
        ),
    ),
  ];
  writeEntries(next);
  traceUserAction(
    "file-list",
    "touchRecentOpenedFile",
    {
      id8: fileId?.slice(0, 8) ?? null,
      pathTail: normalizedPath?.slice(-48) ?? null,
      entryId: primaryId.slice(0, 16),
    },
    "ok",
  );
}

/** 批量 track 且仅打开首个文件时：其余文件写入最近列表（按输入顺序，首个最终在顶部）。 */
export function touchRecentTrackedFiles(
  files: ReadonlyArray<{ fileId: string; absPath?: string | null }>,
): void {
  for (let i = files.length - 1; i >= 0; i -= 1) {
    touchRecentOpenedFile(files[i]!);
  }
}

/**
 * 本地草稿正式保存后：一次性移除 draft/path 旧条目并置顶 catalog 文件 id，
 * 避免最近列表先后出现草稿卡与正式卡。
 */
export function promoteRecentCatalogFile(
  draftId: string | null | undefined,
  catalogFileId: string,
  absPath?: string | null,
): void {
  if (!catalogFileId) {
    return;
  }
  const pathMap = readRecentPathByFileId();
  if (draftId) {
    delete pathMap[draftId];
  }
  writeRecentPathByFileId(pathMap);
  const now = new Date().toISOString();
  const normalizedPath = absPath?.trim() || getRecentPathForFileId(catalogFileId);
  const pathEntryId = normalizedPath
    ? toRecentPathEntryId(normalizedPath)
    : null;
  const primaryId = pathEntryId ?? catalogFileId;
  const next = [
    { id: primaryId, accessedAt: now },
    ...readEntries().filter((entry) => {
      if (entry.id === primaryId || entry.id === catalogFileId) {
        return false;
      }
      if (draftId && entry.id === draftId) {
        return false;
      }
      if (normalizedPath && isRecentPathEntry(entry.id)) {
        const entryPath = getRecentPathFromEntryId(entry.id);
        if (entryPath && pathsEqualForRecent(entryPath, normalizedPath)) {
          return false;
        }
      }
      return true;
    }),
  ];
  if (normalizedPath) {
    rememberRecentPathForFileId(catalogFileId, normalizedPath);
  }
  writeEntries(next);
  traceUserAction(
    "file-list",
    "promoteRecentCatalogFile",
    {
      draftId8: draftId?.slice(0, 12) ?? null,
      catalogId8: catalogFileId.slice(0, 8),
    },
    "ok",
  );
}

export function isRecentPathEntry(id: string): boolean {
  return id.startsWith(RECENT_PATH_PREFIX);
}

export function toRecentPathEntryId(absPath: string): string {
  return `${RECENT_PATH_PREFIX}${absPath}`;
}

export function getRecentPathFromEntryId(id: string): string | null {
  return isRecentPathEntry(id) ? id.slice(RECENT_PATH_PREFIX.length) : null;
}

export function getRecentFileEntries(): RecentFileEntry[] {
  return pruneEntries(readEntries())
    .filter((entry) => !entry.id.startsWith("local-temp:"))
    .sort(
      (a, b) =>
        new Date(b.accessedAt).getTime() - new Date(a.accessedAt).getTime(),
    );
}

export type RecentEntryResolveContext = {
  filesById: ReadonlyMap<string, { id: string } & Record<string, unknown>>;
  recentPathCatalogFiles: Readonly<Record<string, { id: string } & Record<string, unknown>>>;
  pathByFileId?: Readonly<Record<string, string>>;
};

/** 将最近条目解析为 catalog file id（用于展示去重）。 */
export function resolveRecentEntryToFileId(
  entry: RecentFileEntry,
  ctx: RecentEntryResolveContext,
): string | null {
  if (isRecentPathEntry(entry.id)) {
    const absPath = getRecentPathFromEntryId(entry.id);
    const match = absPath ? findRecentPathCatalogFile(ctx.recentPathCatalogFiles, absPath) : null;
    return match?.file.id ?? null;
  }
  if (ctx.filesById.has(entry.id)) {
    return entry.id;
  }
  const mappedPath =
    ctx.pathByFileId?.[entry.id] ?? getRecentPathForFileId(entry.id);
  if (mappedPath) {
    const match = findRecentPathCatalogFile(ctx.recentPathCatalogFiles, mappedPath);
    if (match?.file.id) {
      return match.file.id;
    }
  }
  for (const [absPath, file] of Object.entries(ctx.recentPathCatalogFiles)) {
    if (file.id === entry.id) {
      return file.id;
    }
    if (mappedPath && pathsEqualForRecent(absPath, mappedPath)) {
      return file.id;
    }
  }
  return null;
}

export function isExcludedFromRecentList(
  entryId: string,
  excludeFileId: string | null | undefined,
): boolean {
  if (!excludeFileId) {
    return false;
  }
  return entryId === excludeFileId;
}

export function pickRecentEntriesExcluding(
  entries: RecentFileEntry[],
  opts: { excludeFileId?: string | null; limit: number },
): RecentFileEntry[] {
  const picked: RecentFileEntry[] = [];
  for (const entry of entries) {
    if (isExcludedFromRecentList(entry.id, opts.excludeFileId)) {
      continue;
    }
    picked.push(entry);
    if (picked.length >= opts.limit) {
      break;
    }
  }
  return picked;
}

export function removeRecentFileEntry(entryId: string): void {
  writeEntries(readEntries().filter((entry) => entry.id !== entryId));
  if (!isRecentPathEntry(entryId)) {
    const pathMap = readRecentPathByFileId();
    if (pathMap[entryId]) {
      delete pathMap[entryId];
      writeRecentPathByFileId(pathMap);
    }
  }
}
