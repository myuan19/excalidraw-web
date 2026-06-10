import { chooseFileCardThumbnail } from "./fileCardThumbnail";
import { fetchThumbnailSvgForCard } from "./fetchThumbnailSvgForCard";
import { FileSyncState } from "./FileSyncState";
import { isLocalDraftFileId } from "./localDraftFileId";
import { LocalThumbnailCache } from "./localThumbnailCache";
import { ensureLocalDraftThumbnailFromCache } from "./localDraftThumbnailRecovery";
import {
  markThumbnailServerMiss,
  shouldFetchServerThumbnail,
} from "./thumbnailServerFetchMiss";
import { patchThumbnailSvgForCard } from "./thumbnailSvg";
import type { ServerFile } from "./ServerSync";

/** 与文件列表卡片 `draftStateById` 单槽逻辑一致 */
export function buildFileCardThumbnailSlot(fileId: string) {
  const syncState = FileSyncState.getSyncState(fileId);
  const preferLocalThumb =
    isLocalDraftFileId(fileId) || syncState === "draft";
  return {
    syncState,
    preferLocalThumb,
    localThumb: preferLocalThumb ? LocalThumbnailCache.get(fileId) : null,
  };
}

/** 与 `useFileListController` 中 `chooseFileCardThumbnail` 调用参数一致 */
export function chooseFileCardThumbnailForFile(
  fileId: string,
  file: ServerFile,
  fetchedThumb?: string | null,
) {
  const slot = buildFileCardThumbnailSlot(fileId);
  return chooseFileCardThumbnail({
    syncState: slot.syncState,
    preferLocalThumb: slot.preferLocalThumb,
    localThumb: slot.localThumb,
    fetchedThumb: fetchedThumb ?? null,
  });
}

/** 文件列表卡片是否会展示缩略图（含将走 GET /thumbnail 的情况） */
export function fileCardThumbnailCanPreview(
  fileId: string,
  file: ServerFile,
  fetchedThumb?: string | null,
): boolean {
  const choice = chooseFileCardThumbnailForFile(fileId, file, fetchedThumb);
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
  const choice = chooseFileCardThumbnailForFile(fileId, file, fetchedThumb);
  if (choice.thumbSvg) {
    return patchThumbnailSvgForCard(choice.thumbSvg);
  }
  if (isLocalDraftFileId(fileId)) {
    const recovered = await ensureLocalDraftThumbnailFromCache(fileId, file.kind);
    return recovered ? patchThumbnailSvgForCard(recovered) : null;
  }
  if (!shouldFetchServerThumbnail(fileId, file)) {
    return null;
  }
  const url = `/api/files/${fileId}/thumbnail${
    file.content_sha256
      ? `?h=${encodeURIComponent(file.content_sha256)}`
      : ""
  }`;
  const { svg, status } = await fetchThumbnailSvgForCard(url, {
    id8: fileId.slice(0, 8),
  });
  if (!svg) {
    if (status === 404) {
      markThumbnailServerMiss(fileId, file.content_sha256);
    }
    return null;
  }
  return patchThumbnailSvgForCard(svg);
}
