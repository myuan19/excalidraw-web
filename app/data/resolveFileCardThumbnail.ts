import { chooseFileCardThumbnail } from "./fileCardThumbnail";
import { fetchThumbnailSvgForCard } from "./fetchThumbnailSvgForCard";
import { patchFileListTreeCacheThumbnailMissing } from "./fileListSessionCache";
import { editorRegistry } from "../editors/registry";
import { FileSyncState } from "./FileSyncState";
import { isLocalDraftFileId } from "./localDraftFileId";
import { LocalThumbnailCache } from "./localThumbnailCache";
import { ensureLocalDraftThumbnailFromCache } from "./localDraftThumbnailRecovery";
import {
  markThumbnailServerMiss,
  shouldFetchServerThumbnail,
} from "./thumbnailServerFetchMiss";
import { toCardSvg } from "./thumbnailService";

import type { ServerFile } from "./ServerSync";

export function fileKindUsesSessionThumbnail(
  kind: string | null | undefined,
): boolean {
  const resolved = editorRegistry.resolveKind(kind);
  return resolved === "excalidraw" || resolved === "mindmap";
}

/** Precomputed slot from `draftStateById` — avoids duplicate sessionStorage reads on render. */
export type FileCardThumbDraftSlot = {
  syncState: "synced" | "draft";
  preferLocalThumb: boolean;
  draftHash?: string | null;
  localDraftThumb?: string | null;
};

/** 与文件列表卡片 `draftStateById` 单槽逻辑一致 */
export function buildFileCardThumbnailSlot(fileId: string) {
  const syncState = FileSyncState.getSyncState(fileId);
  const preferLocalThumb = isLocalDraftFileId(fileId) || syncState === "draft";
  const draftHash = FileSyncState.getDraftHash(fileId);
  return {
    syncState,
    preferLocalThumb,
    draftHash,
    localThumb: preferLocalThumb
      ? LocalThumbnailCache.getForDraft(fileId, draftHash)
      : null,
  };
}

/** Excalidraw/MindMap drafts wait for session preview; server GET would not be shown. */
export function shouldAwaitSessionThumbnailBeforeServerFetch(
  file: ServerFile,
  syncState: "synced" | "draft",
  localDraftThumb: string | null | undefined,
): boolean {
  return (
    syncState === "draft" &&
    fileKindUsesSessionThumbnail(file.kind) &&
    !localDraftThumb
  );
}

/** 与 `useFileListController` 中 `chooseFileCardThumbnail` 调用参数一致 */
export function chooseFileCardThumbnailForFile(
  fileId: string,
  file: ServerFile,
  fetchedThumb?: string | null,
  fetchedThumbContentSha?: string | null,
  draftSlot?: FileCardThumbDraftSlot,
) {
  let syncState: "synced" | "draft";
  let preferLocalThumb: boolean;
  let localThumb: string | null;

  if (draftSlot) {
    syncState = draftSlot.syncState;
    preferLocalThumb = draftSlot.preferLocalThumb;
    localThumb = preferLocalThumb
      ? (draftSlot.localDraftThumb ?? null)
      : LocalThumbnailCache.getForContent(fileId, file.content_sha256);
  } else {
    const slot = buildFileCardThumbnailSlot(fileId);
    syncState = slot.syncState;
    preferLocalThumb = slot.preferLocalThumb;
    localThumb = preferLocalThumb
      ? slot.localThumb
      : LocalThumbnailCache.getForContent(fileId, file.content_sha256);
  }

  return {
    choice: chooseFileCardThumbnail({
      syncState,
      preferLocalThumb,
      blockStaleFetchedFallback:
        preferLocalThumb && fileKindUsesSessionThumbnail(file.kind),
      localThumb,
      fetchedThumb: fetchedThumb ?? null,
      fetchedThumbContentSha,
      fileContentSha: file.content_sha256 ?? null,
    }),
    syncState,
    preferLocalThumb,
  };
}

/** 文件列表卡片是否会展示缩略图（含将走 GET /thumbnail 的情况） */
export function fileCardThumbnailCanPreview(
  fileId: string,
  file: ServerFile,
  fetchedThumb?: string | null,
): boolean {
  const { choice } = chooseFileCardThumbnailForFile(fileId, file, fetchedThumb);
  if (choice.thumbSvg) {
    return true;
  }
  if (isLocalDraftFileId(fileId)) {
    return false;
  }
  return shouldFetchServerThumbnail(fileId, file);
}

/**
 * 解析用于卡片/悬停预览的 SVG（已 patch），逻辑与文件列表最终 `cardThumbSvg` 一致。
 */
export async function resolveFileCardThumbnailSvg(
  fileId: string,
  file: ServerFile,
  fetchedThumb?: string | null,
): Promise<string | null> {
  const { choice } = chooseFileCardThumbnailForFile(fileId, file, fetchedThumb);
  if (choice.thumbSvg) {
    return toCardSvg(choice.thumbSvg);
  }
  if (isLocalDraftFileId(fileId)) {
    const recovered = await ensureLocalDraftThumbnailFromCache(
      fileId,
      file.kind,
    );
    return recovered ? toCardSvg(recovered) : null;
  }
  if (!shouldFetchServerThumbnail(fileId, file)) {
    return null;
  }
  const url = `/api/files/${fileId}/thumbnail${
    file.content_sha256 ? `?h=${encodeURIComponent(file.content_sha256)}` : ""
  }`;
  const { svg, status } = await fetchThumbnailSvgForCard(url, {
    id8: fileId.slice(0, 8),
  });
  if (!svg) {
    if (status === 404) {
      markThumbnailServerMiss(fileId, file.content_sha256);
      patchFileListTreeCacheThumbnailMissing(fileId, file.content_sha256);
    }
    return null;
  }
  return toCardSvg(svg);
}
