import { editorRegistry } from "../editors/registry";

import { dispatchFileListIncrementalApply } from "./fileListIncrementalPatch";
import {
  resolveFileListCardLocalThumbPolicy,
  resolveListCardLocalThumb,
  type FileListCardLocalThumbPolicy,
} from "./fileCardThumbnail";
import { patchFileListTreeCacheSavedFile } from "./fileListSessionCache";
import { markFileListIncrementalSave } from "./fileListRefreshCoordinator";
import { traceThumb, id8 } from "../lib/interactionDebugTrace";
import { FileSyncState } from "./FileSyncState";
import { isLocalDraftFileId } from "./localDraftFileId";
import { LocalThumbnailCache } from "./localThumbnailCache";
import {
  bindSavedFileThumbnailToContentSha,
  cacheDraftFileThumbnail,
} from "./sessionFileThumbnail";
import { thumbnailSvgHasVisibleContent } from "./thumbnailSvg";

import type { ServerFile } from "./ServerSync";

export type ThumbnailSyncState = "synced" | "draft";

export type ThumbnailDraftSlot = {
  syncState: ThumbnailSyncState;
  preferLocalThumb: boolean;
  baseHash: string | null;
  draftHash: string | null;
  /** 编辑 session 实时预览（sceneHash 槽），供 pipeline 判断是否等待 session。 */
  localDraftThumb: string | null;
  /** 文件列表卡片应展示的本地缩略图（由 listLocalPolicy 决定来源）。 */
  listLocalThumb: string | null;
  listLocalPolicy: FileListCardLocalThumbPolicy;
};

export type SavedThumbnailPatch = {
  fileId: string;
  kind: string;
  name: string;
  contentSha?: string | null;
  version?: number | null;
  updatedAt?: string | null;
  thumbnail?: string | null;
};

export function editorUsesSessionThumbnail(
  kind: string | null | undefined,
): boolean {
  const resolved = editorRegistry.resolveKind(kind);
  return resolved === "excalidraw" || resolved === "mindmap";
}

function isLocalEditNewerThanServer(file: ServerFile): boolean {
  const localEditTime = FileSyncState.getLocalEditTime(file.id);
  if (!localEditTime) {
    return false;
  }
  const localTime = Date.parse(localEditTime);
  const serverTime = Date.parse(file.updated_at);
  return (
    Number.isFinite(localTime) &&
    Number.isFinite(serverTime) &&
    localTime > serverTime
  );
}

export function buildThumbnailDraftSlot(file: ServerFile): ThumbnailDraftSlot {
  const fileId = file.id;
  const storedSyncState = FileSyncState.getSyncState(fileId);
  const syncState =
    storedSyncState === "draft" || isLocalEditNewerThanServer(file)
      ? "draft"
      : "synced";
  const preferLocalThumb = isLocalDraftFileId(fileId) || syncState === "draft";
  const draftHash = FileSyncState.getDraftHash(fileId);
  const listLocalPolicy = resolveFileListCardLocalThumbPolicy(fileId, syncState);
  const localDraftThumb = LocalThumbnailCache.getDraftPreview(fileId, draftHash);
  const listLocalThumb = resolveListCardLocalThumb({
    fileId,
    policy: listLocalPolicy,
    draftHash,
    contentSha: file.content_sha256,
  });

  return {
    syncState,
    preferLocalThumb,
    baseHash: FileSyncState.getBaselineHash(fileId),
    draftHash,
    localDraftThumb,
    listLocalThumb,
    listLocalPolicy,
  };
}

export function cacheDraftThumbnailIfVisible(
  fileId: string,
  kind: string | null | undefined,
  svg: string | null | undefined,
  sceneHash: string | null | undefined,
): string | null {
  if (!svg || !sceneHash || !thumbnailSvgHasVisibleContent(svg)) {
    return null;
  }
  cacheDraftFileThumbnail(fileId, svg, sceneHash);
  return svg;
}

export function finalizeSavedThumbnail({
  fileId,
  kind,
  name,
  contentSha,
  version,
  updatedAt,
  thumbnail,
}: SavedThumbnailPatch): string | null {
  const savedThumbnail = editorUsesSessionThumbnail(kind)
    ? bindSavedFileThumbnailToContentSha(fileId, contentSha, thumbnail)
    : null;
  patchFileListTreeCacheSavedFile(fileId, {
    name,
    kind,
    has_thumbnail: savedThumbnail ? true : undefined,
    content_sha256: contentSha ?? undefined,
    version: version ?? undefined,
    updated_at: updatedAt ?? undefined,
  });
  markFileListIncrementalSave(fileId);
  traceThumb("finalizeSaved", {
    fileId8: id8(fileId),
    kind,
    contentSha8: contentSha?.slice(0, 8) ?? null,
    hasSavedThumb: !!savedThumbnail,
    thumbLen: savedThumbnail?.length ?? thumbnail?.length ?? 0,
    version: version ?? null,
  });
  dispatchFileListIncrementalApply(fileId);
  return savedThumbnail;
}
