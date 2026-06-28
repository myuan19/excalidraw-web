import { editorRegistry } from "../editors/registry";

import {
  resolveFileListCardLocalThumbPolicy,
  resolveListCardLocalThumb,
  type FileListCardLocalThumbPolicy,
} from "./fileCardThumbnail";
import { dispatchFileListIncrementalApply } from "./fileListIncrementalPatch";
import { patchFileListTreeCacheSavedFile } from "./fileListSessionCache";
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
  /** 编辑中实时预览（draft 槽） */
  localDraftThumb: string | null;
  listLocalPolicy: FileListCardLocalThumbPolicy;
  /** 列表卡片按策略解析的本地缩略图 */
  listLocalThumb: string | null;
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
  const listLocalThumb = resolveListCardLocalThumb({
    fileId,
    policy: listLocalPolicy,
    draftHash,
    contentSha: file.content_sha256,
  });
  const localDraftThumb = LocalThumbnailCache.getDraftPreview(fileId, draftHash);

  return {
    syncState,
    preferLocalThumb,
    baseHash: FileSyncState.getBaselineHash(fileId),
    draftHash,
    localDraftThumb,
    listLocalPolicy,
    listLocalThumb,
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
  const savedThumbnail = bindSavedFileThumbnailToContentSha(
    fileId,
    contentSha,
    thumbnail,
  );
  patchFileListTreeCacheSavedFile(fileId, {
    name,
    kind,
    has_thumbnail: savedThumbnail ? true : undefined,
    content_sha256: contentSha ?? undefined,
    version: version ?? undefined,
    updated_at: updatedAt ?? undefined,
  });
  dispatchFileListIncrementalApply(fileId);
  return savedThumbnail;
}

export function finalizeSavedThumbnailMetadata({
  fileId,
  kind,
  name,
  contentSha,
  version,
  updatedAt,
}: SavedThumbnailPatch): null {
  patchFileListTreeCacheSavedFile(fileId, {
    name,
    kind,
    content_sha256: contentSha ?? undefined,
    version: version ?? undefined,
    updated_at: updatedAt ?? undefined,
  });
  dispatchFileListIncrementalApply(fileId);
  return null;
}
