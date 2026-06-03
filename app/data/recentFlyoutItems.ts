import { draftSessionToServerFile } from "./localDraftSessions";
import { getFileIdFromHash } from "./fileIdFromHash";
import { readFileListTreeCache } from "./fileListSessionCache";
import {
  getRecentFileEntries,
  pickRecentEntriesExcluding,
} from "./recentFiles";
import { LocalDraftSessions } from "./localDraftSessions";
import { editorRegistry } from "../editors/registry";
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
};

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

  const cached = readFileListTreeCache();
  const filesById = new Map<string, ServerFile>();
  for (const file of cached?.files ?? []) {
    filesById.set(file.id, file);
  }
  for (const draft of LocalDraftSessions.listIndexed()) {
    filesById.set(draft.id, draftSessionToServerFile(draft));
  }

  const items: RecentFlyoutItem[] = [];
  const entries = pickRecentEntriesExcluding(getRecentFileEntries(), {
    excludeFileId,
    limit: Number.POSITIVE_INFINITY,
  });
  for (const entry of entries) {
    const file = filesById.get(entry.id);
    if (!file) {
      continue;
    }
    const hasThumbnail = !!file.has_thumbnail;
    items.push({
      id: file.id,
      name: file.name || "未命名",
      kind: editorRegistry.resolveKind(file.kind),
      hasThumbnail,
      contentSha256: file.content_sha256 ?? null,
    });
    if (items.length >= limit) {
      break;
    }
  }
  return items;
}

/** 按 id 取最近项对应的文件记录（与 resolveRecentFlyoutItems 同源） */
export function resolveRecentFlyoutFileRecord(
  fileId: string,
): ServerFile | null {
  const cached = readFileListTreeCache();
  const fromTree = cached?.files.find((file) => file.id === fileId);
  if (fromTree) {
    return fromTree;
  }
  const draft = LocalDraftSessions.get(fileId);
  if (draft) {
    return draftSessionToServerFile(draft);
  }
  return null;
}
