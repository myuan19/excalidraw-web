import { draftSessionToServerFile } from "./localDraftSessions";
import { getFileIdFromHash } from "./fileIdFromHash";
import { readFileListTreeCache } from "./fileListSessionCache";
import { findCatalogFileByAbsPath } from "./recentPathCatalogSync";
import {
  getRecentFileEntries,
  getRecentPathFromEntryId,
  isRecentPathEntry,
  pickRecentEntriesExcluding,
  resolveRecentEntryToFileId,
} from "./recentFiles";
import { LocalDraftSessions } from "./localDraftSessions";
import { editorRegistry } from "../editors/registry";
import { traceIssueDiag } from "../lib/issueDiagTrace";
import type { ServerFile } from "./ServerSync";

export type RecentFlyoutItem = {
  id: string;
  name: string;
  kind: string;
  hasThumbnail: boolean;
  contentSha256: string | null;
};

export function getActiveDocumentFileId(): string | null {
  return getFileIdFromHash();
}

export type ResolveRecentFlyoutItemsOptions = {
  /** 优先使用；未传时从 location.hash 读取 */
  excludeFileId?: string | null;
  /** 最多展示条数（上限）；其它文件不足时只显示实际数量，不凑满 */
  limit?: number;
  /** 诊断：写入 desktop-op.log（grep issue.diag | recent.flyout） */
  diagReason?: string;
};

function buildFlyoutFilesById(): Map<string, ServerFile> {
  const cached = readFileListTreeCache();
  const filesById = new Map<string, ServerFile>();
  for (const file of cached?.files ?? []) {
    filesById.set(file.id, file);
  }
  for (const draft of LocalDraftSessions.listIndexed()) {
    filesById.set(draft.id, draftSessionToServerFile(draft));
  }
  return filesById;
}

function resolveFlyoutFileForEntry(
  entryId: string,
  filesById: ReadonlyMap<string, ServerFile>,
): ServerFile | null {
  if (isRecentPathEntry(entryId)) {
    const absPath = getRecentPathFromEntryId(entryId);
    return absPath ? findCatalogFileByAbsPath(absPath, filesById) : null;
  }
  const fromTree = filesById.get(entryId);
  if (fromTree) {
    return fromTree;
  }
  const draft = LocalDraftSessions.get(entryId);
  return draft ? draftSessionToServerFile(draft) : null;
}

/** 最近飞出栏：排除当前正在编辑的文档，且仅展示仍存在于本地的条目（最多 limit 条） */
export function resolveRecentFlyoutItems(
  limitOrOptions: number | ResolveRecentFlyoutItemsOptions = 6,
): RecentFlyoutItem[] {
  const options =
    typeof limitOrOptions === "number"
      ? { limit: limitOrOptions }
      : limitOrOptions;
  const limit = options.limit ?? 6;
  const excludeFileId =
    options.excludeFileId !== undefined
      ? options.excludeFileId
      : getActiveDocumentFileId();

  const filesById = buildFlyoutFilesById();
  const resolveCtx = {
    filesById,
    recentPathCatalogFiles: {},
  };

  const items: RecentFlyoutItem[] = [];
  const skippedEntryIds: string[] = [];
  const entries = pickRecentEntriesExcluding(getRecentFileEntries(), {
    excludeFileId,
    limit: Number.POSITIVE_INFINITY,
  });
  for (const entry of entries) {
    const resolvedId = resolveRecentEntryToFileId(entry, resolveCtx);
    const file =
      (resolvedId ? filesById.get(resolvedId) : null) ??
      resolveFlyoutFileForEntry(entry.id, filesById);
    if (!file) {
      skippedEntryIds.push(entry.id);
      continue;
    }
    items.push({
      id: file.id,
      name: file.name || "未命名",
      kind: editorRegistry.resolveKind(file.kind),
      hasThumbnail: !!file.has_thumbnail,
      contentSha256: file.content_sha256 ?? null,
    });
    if (items.length >= limit) {
      break;
    }
  }
  if (options.diagReason !== undefined) {
    traceIssueDiag(
      "recent.flyout",
      "resolve",
      {
        reason: options.diagReason,
        excludeFileId8: excludeFileId ? excludeFileId.slice(0, 8) : null,
        entryCount: entries.length,
        resolvedCount: items.length,
        skippedCount: skippedEntryIds.length,
        cacheFileCount: filesById.size,
        itemIds8: items.map((item) => item.id.slice(0, 8)),
        skippedEntryIds8: skippedEntryIds.slice(0, 12).map((id) => id.slice(0, 8)),
      },
      items.length === 0 && entries.length > 0 ? "fail" : "ok",
    );
  }
  return items;
}

/** 按 id 取最近项对应的文件记录（与 resolveRecentFlyoutItems 同源） */
export function resolveRecentFlyoutFileRecord(
  fileId: string,
): ServerFile | null {
  const filesById = buildFlyoutFilesById();
  return filesById.get(fileId) ?? null;
}
