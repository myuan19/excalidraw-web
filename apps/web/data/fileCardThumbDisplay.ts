import { getEditSessionBadge } from "./editSessionService";
import {
  isCorruptCatalogFile,
} from "./catalogCapabilities";
import { isLocalDraftFileId } from "./localDraftFileId";
import { buildFileCardThumbnailSlot } from "./resolveFileCardThumbnail";
import { chooseFileCardThumbnailForFile } from "./resolveFileCardThumbnail";
import { isThumbnailSavePending } from "./thumbnailSavePending";
import { isThumbnailServerMiss } from "./thumbnailServerFetchMiss";
import { toCardSvg } from "./thumbnailService";
import { editorUsesSessionThumbnail } from "./thumbnailLifecycle";
import { extractThumbBg } from "./thumbnailSvg";
import { traceThumbCardDisplay } from "../lib/interactionDebugTrace";
import { editorRegistry } from "../editors/registry";
import type { ServerFile } from "./ServerSync";

export type FileCardThumbBadge =
  | "temporary"
  | "draft"
  | "interrupted"
  | "corrupt"
  | null;

export type FileCardThumbDisplay = {
  kind: string;
  badge: FileCardThumbBadge;
  cardThumbSvg: string | null;
  thumbLoading: boolean;
  /** 保存进行中：浅蓝 loading（叠在旧缩略图上或单独占位） */
  thumbSwitchLoading: boolean;
  thumbBlank: boolean;
  thumbBg: string | undefined;
};

/** 与文件列表 `renderFileCard` 缩略图区域展示逻辑一致 */
export function resolveFileCardThumbDisplay(
  fileId: string,
  file: ServerFile,
  fetchedThumb?: string | null,
  fetchedThumbContentSha?: string | null,
): FileCardThumbDisplay {
  const isBrowserDraft = isLocalDraftFileId(fileId);
  const slot = buildFileCardThumbnailSlot(fileId);
  const thumbnailChoice = chooseFileCardThumbnailForFile(
    fileId,
    file,
    fetchedThumb,
    fetchedThumbContentSha,
  );
  const thumbSvg = thumbnailChoice.thumbSvg;
  const cardThumbSvg =
    isCorruptCatalogFile(file) || !thumbSvg ? null : toCardSvg(thumbSvg);
  const thumbSaveLoading =
    isThumbnailSavePending(fileId) && !isCorruptCatalogFile(file);
  const draftAwaitingSession =
    slot.listLocalPolicy === "live-draft-preview" &&
    editorUsesSessionThumbnail(file.kind) &&
    !slot.localDraftThumb;
  const thumbFetchLoading =
    !thumbSaveLoading &&
    !isCorruptCatalogFile(file) &&
    !thumbSvg &&
    !!file.has_thumbnail &&
    !isBrowserDraft &&
    !draftAwaitingSession &&
    !isThumbnailServerMiss(fileId, file.content_sha256);
  const thumbLoading = thumbFetchLoading;
  const thumbSwitchLoading = thumbSaveLoading;
  const thumbBlank = false;
  const sessionBadge = getEditSessionBadge(fileId);
  const reasons: string[] = [];
  if (isCorruptCatalogFile(file)) {
    reasons.push("corrupt");
  }
  if (thumbSaveLoading) {
    reasons.push("save-pending-blue-loading");
  }
  if (draftAwaitingSession) {
    reasons.push("draft-awaiting-session-thumb");
  }
  if (thumbFetchLoading) {
    reasons.push("server-fetch-loading");
  }
  if (isThumbnailServerMiss(fileId, file.content_sha256)) {
    reasons.push("server-thumb-miss-registered");
  }
  if (cardThumbSvg) {
    reasons.push(`show-svg:${thumbnailChoice.finalSource ?? "unknown"}`);
  } else if (!thumbLoading && !thumbSwitchLoading) {
    reasons.push("placeholder");
  }
  let badge: FileCardThumbBadge = isBrowserDraft
    ? "temporary"
    : isCorruptCatalogFile(file)
      ? "corrupt"
      : slot.syncState === "draft"
        ? "draft"
        : sessionBadge === "interrupted"
          ? "interrupted"
          : null;
  if (thumbSaveLoading) {
    badge = null;
  }

  const display = {
    kind: editorRegistry.resolveKind(file.kind),
    badge,
    cardThumbSvg,
    thumbLoading,
    thumbSwitchLoading,
    thumbBlank,
    thumbBg: thumbSvg ? extractThumbBg(thumbSvg) : undefined,
  };
  traceThumbCardDisplay({
    fileId,
    kind: file.kind,
    syncState: slot.syncState,
    listLocalPolicy: slot.listLocalPolicy,
    finalSource: thumbnailChoice.finalSource,
    badge: display.badge,
    hasCardThumb: !!display.cardThumbSvg,
    thumbLoading: display.thumbLoading,
    thumbSwitchLoading: display.thumbSwitchLoading,
    savePending: thumbSaveLoading,
    contentSha8: file.content_sha256?.slice(0, 8) ?? null,
    hasServerThumbFlag: !!file.has_thumbnail,
    fetchedLen: fetchedThumb?.length ?? 0,
    localLen: slot.listLocalThumb?.length ?? 0,
    reasons,
  });
  return display;
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
    thumbSwitchLoading: false,
    thumbBlank: false,
    thumbBg: extractThumbBg(cachedCardThumbSvg),
  };
}
