import { editorRegistry } from "../editors/registry";

import { isLocalDraftFileId } from "./localDraftFileId";
import {
  chooseFileCardThumbnailForFile,
  type FileCardThumbDraftSlot,
} from "./resolveFileCardThumbnail";
import { hasPendingSavedFileThumbnail } from "./sessionFileThumbnail";
import { editorUsesSessionThumbnail } from "./thumbnailLifecycle";
import { isThumbnailServerMiss } from "./thumbnailServerFetchMiss";
import { toCardSvg } from "./thumbnailService";
import { extractThumbBg } from "./thumbnailSvg";

import type { FileCardThumbnailChoice } from "./fileCardThumbnail";
import type { ServerFile } from "./ServerSync";

export type FileCardThumbBadge = "temp" | "draft" | null;

export type FileCardThumbDisplay = {
  kind: string;
  badge: FileCardThumbBadge;
  cardThumbSvg: string | null;
  thumbLoading: boolean;
  thumbBg: string | undefined;
};

export type FileCardThumbState = {
  choice: FileCardThumbnailChoice;
  display: FileCardThumbDisplay;
};

function buildFileCardThumbDisplay(
  fileId: string,
  file: ServerFile,
  choice: FileCardThumbnailChoice,
  syncState: "synced" | "draft",
): FileCardThumbDisplay {
  const isBrowserDraft = isLocalDraftFileId(fileId);
  const pendingSavedThumb = hasPendingSavedFileThumbnail(
    fileId,
    file.content_sha256,
  );
  const thumbSvg = pendingSavedThumb ? null : choice.thumbSvg;
  const cardThumbSvg = toCardSvg(thumbSvg);
  const usesSessionThumbnail = editorUsesSessionThumbnail(file.kind);
  const thumbLoading =
    (pendingSavedThumb ||
      (!thumbSvg &&
        !isThumbnailServerMiss(fileId, file.content_sha256) &&
        (usesSessionThumbnail
          ? syncState === "draft" || isBrowserDraft || !!file.has_thumbnail
          : !!file.has_thumbnail && !isBrowserDraft)));
  const badge: FileCardThumbBadge = isBrowserDraft
    ? "temp"
    : syncState === "draft"
      ? "draft"
      : null;

  return {
    kind: editorRegistry.resolveKind(file.kind),
    badge,
    cardThumbSvg,
    thumbLoading,
    thumbBg: cardThumbSvg ? extractThumbBg(thumbSvg!) : undefined,
  };
}

/** 文件列表卡片：一次解析 choice + display，可传入 memoized draftSlot 避免重复读缓存 */
export function resolveFileCardThumbState(
  fileId: string,
  file: ServerFile,
  fetchedThumb?: string | null,
  fetchedThumbContentSha?: string | null,
  draftSlot?: FileCardThumbDraftSlot,
): FileCardThumbState {
  const { choice, syncState } = chooseFileCardThumbnailForFile(
    fileId,
    file,
    fetchedThumb,
    fetchedThumbContentSha,
    draftSlot,
  );
  return {
    choice,
    display: buildFileCardThumbDisplay(fileId, file, choice, syncState),
  };
}

/** 与文件列表 `renderFileCard` 缩略图区域展示逻辑一致 */
export function resolveFileCardThumbDisplay(
  fileId: string,
  file: ServerFile,
  fetchedThumb?: string | null,
  fetchedThumbContentSha?: string | null,
  draftSlot?: FileCardThumbDraftSlot,
): FileCardThumbDisplay {
  return resolveFileCardThumbState(
    fileId,
    file,
    fetchedThumb,
    fetchedThumbContentSha,
    draftSlot,
  ).display;
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
  if (fresh.thumbLoading || fresh.cardThumbSvg) {
    return fresh;
  }
  return {
    ...fresh,
    cardThumbSvg: cachedCardThumbSvg,
    thumbLoading: false,
    thumbBg: extractThumbBg(cachedCardThumbSvg),
  };
}
