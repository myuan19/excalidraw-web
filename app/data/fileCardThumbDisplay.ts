import { isLocalDraftFileId } from "./localDraftFileId";
import {
  buildFileCardThumbnailSlot,
  chooseFileCardThumbnailForFile,
} from "./resolveFileCardThumbnail";
import { isThumbnailServerMiss } from "./thumbnailServerFetchMiss";
import { extractThumbBg, patchThumbnailSvgForCard } from "./thumbnailSvg";
import { editorRegistry } from "../editors/registry";
import type { ServerFile } from "./ServerSync";

export type FileCardThumbBadge = "temp" | "draft" | null;

export type FileCardThumbDisplay = {
  kind: string;
  badge: FileCardThumbBadge;
  cardThumbSvg: string | null;
  thumbLoading: boolean;
  thumbBg: string | undefined;
};

/** 与文件列表 `renderFileCard` 缩略图区域展示逻辑一致 */
export function resolveFileCardThumbDisplay(
  fileId: string,
  file: ServerFile,
  fetchedThumb?: string | null,
): FileCardThumbDisplay {
  const isBrowserDraft = isLocalDraftFileId(fileId);
  const slot = buildFileCardThumbnailSlot(fileId);
  const thumbnailChoice = chooseFileCardThumbnailForFile(
    fileId,
    file,
    fetchedThumb,
  );
  const thumbSvg = thumbnailChoice.thumbSvg;
  const cardThumbSvg = thumbSvg ? patchThumbnailSvgForCard(thumbSvg) : null;
  const thumbLoading =
    !thumbSvg &&
    !!file.has_thumbnail &&
    !isBrowserDraft &&
    !isThumbnailServerMiss(fileId, file.content_sha256);
  const badge: FileCardThumbBadge = isBrowserDraft
    ? "temp"
    : slot.syncState === "draft"
      ? "draft"
      : null;

  return {
    kind: editorRegistry.resolveKind(file.kind),
    badge,
    cardThumbSvg,
    thumbLoading,
    thumbBg: thumbSvg ? extractThumbBg(thumbSvg) : undefined,
  };
}

/** 悬停预览：缩略图可走缓存，角标/加载态始终按当前文件状态重算 */
export function mergeFileCardThumbDisplay(
  fileId: string,
  file: ServerFile,
  cachedCardThumbSvg?: string | null,
): FileCardThumbDisplay {
  const fresh = resolveFileCardThumbDisplay(fileId, file);
  if (!cachedCardThumbSvg) {
    return fresh;
  }
  return {
    ...fresh,
    cardThumbSvg: cachedCardThumbSvg,
    thumbLoading: false,
    thumbBg: extractThumbBg(cachedCardThumbSvg),
  };
}
