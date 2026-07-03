import { chooseFileCardThumbnail } from "./fileCardThumbnail";
import { devDebug } from "../lib/devDebug";
import { traceThumb } from "../lib/interactionDebugTrace";
import { isCorruptCatalogFile } from "./catalogCapabilities";
import { fetchThumbnailSvgForCard } from "./fetchThumbnailSvgForCard";
import { patchFileListTreeCacheThumbnailMissing } from "./fileListSessionCache";
import { isLocalDraftFileId } from "./localDraftFileId";
import { ensureLocalDraftThumbnailFromCache } from "./localDraftThumbnailRecovery";
import {
  buildThumbnailDraftSlot,
  editorUsesSessionThumbnail,
} from "./thumbnailLifecycle";
import {
  markThumbnailServerMiss,
  shouldFetchServerThumbnail,
} from "./thumbnailServerFetchMiss";
import { isNativeMindMapThumbnailSvg } from "./thumbnailSvg";
import { toCardSvg } from "./thumbnailService";
import type { ServerFile } from "./ServerSync";

/** 列表卡片缩略图槽（与 draftStateById 一致）。 */
export function buildFileCardThumbnailSlot(file: ServerFile) {
  return buildThumbnailDraftSlot(file);
}

/** Excalidraw/MindMap：session 实时预览未就绪时不拉服务器 GET。 */
export function shouldAwaitSessionThumbnailBeforeServerFetch(
  file: ServerFile,
  draftSlot: ReturnType<typeof buildThumbnailDraftSlot>,
): boolean {
  return (
    draftSlot.listLocalPolicy === "live-draft-preview" &&
    editorUsesSessionThumbnail(file.kind) &&
    !draftSlot.localDraftThumb
  );
}

/** 与 `useFileListController` 中 `chooseFileCardThumbnail` 调用参数一致 */
export function chooseFileCardThumbnailForFile(
  fileId: string,
  file: ServerFile,
  fetchedThumb?: string | null,
  fetchedThumbContentSha?: string | null,
) {
  const draftSlot = buildThumbnailDraftSlot(file);
  // listLocalThumb 已按 listLocalPolicy 解析好正确来源：
  //  - live-draft-preview → 实时草稿预览
  //  - draft-preview-until-sync → 草稿会话预览优先，回落上次已保存图
  //  - synced-session → contentSha 绑定图
  // 故以 policy 结果为准，仅在其缺失时回退到草稿实时预览。
  const localThumb = draftSlot.listLocalThumb ?? draftSlot.localDraftThumb;
  const fetchedMindMapIsNonNative =
    file.kind === "mindmap" &&
    fetchedThumb &&
    !isNativeMindMapThumbnailSvg(fetchedThumb) &&
    draftSlot.syncState !== "draft";
  if (fetchedMindMapIsNonNative) {
    devDebug("thumbnail-pipeline", "[DEBUG] thumb-choice | drop non-native mindmap fetched thumb", {
      fileId,
      id8: fileId.slice(0, 8),
      contentSha: file.content_sha256 ?? null,
      fetchedLen: fetchedThumb.length,
      hasLocalThumb: !!localThumb,
      syncState: draftSlot.syncState,
      listLocalPolicy: draftSlot.listLocalPolicy,
    });
  }
  const resolvedFetchedThumb = fetchedMindMapIsNonNative
    ? null
    : (fetchedThumb ?? null);
  const choice = chooseFileCardThumbnail({
    fileId,
    syncState: draftSlot.syncState,
    listLocalPolicy: draftSlot.listLocalPolicy,
    preferLocalThumb: draftSlot.preferLocalThumb,
    localThumb,
    fetchedThumb: resolvedFetchedThumb,
    fetchedThumbContentSha,
    fileContentSha: file.content_sha256 ?? null,
  });
  devDebug("thumbnail-pipeline", "thumb-choice", {
    fileId8: fileId.slice(0, 8),
    kind: file.kind,
    syncState: draftSlot.syncState,
    listLocalPolicy: draftSlot.listLocalPolicy,
    finalSource: choice.finalSource,
    hasLocalThumb: !!localThumb,
    hasFetched: !!resolvedFetchedThumb,
    thumbLen: choice.thumbSvg?.length ?? 0,
    droppedNonNativeMindMap: fetchedMindMapIsNonNative,
  });
  traceThumb("choice", {
    fileId8: fileId.slice(0, 8),
    kind: file.kind,
    syncState: draftSlot.syncState,
    listLocalPolicy: draftSlot.listLocalPolicy,
    finalSource: choice.finalSource,
    hasLocalThumb: !!localThumb,
    hasFetched: !!resolvedFetchedThumb,
    thumbLen: choice.thumbSvg?.length ?? 0,
    droppedNonNativeMindMap: fetchedMindMapIsNonNative,
    contentSha8: file.content_sha256?.slice(0, 8) ?? null,
  });
  return choice;
}

/** 文件列表卡片是否会展示缩略图（含将走 GET /thumbnail 的情况） */
export function fileCardThumbnailCanPreview(
  fileId: string,
  file: ServerFile,
  fetchedThumb?: string | null,
  fetchedThumbContentSha?: string | null,
): boolean {
  if (isCorruptCatalogFile(file)) {
    return false;
  }
  const choice = chooseFileCardThumbnailForFile(
    fileId,
    file,
    fetchedThumb,
    fetchedThumbContentSha,
  );
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
  fetchedThumbContentSha?: string | null,
): Promise<string | null> {
  const choice = chooseFileCardThumbnailForFile(
    fileId,
    file,
    fetchedThumb,
    fetchedThumbContentSha,
  );
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
  const draftSlot = buildThumbnailDraftSlot(file);
  if (shouldAwaitSessionThumbnailBeforeServerFetch(file, draftSlot)) {
    return null;
  }
  if (!shouldFetchServerThumbnail(fileId, file)) {
    return null;
  }
  const url = `/api/files/${fileId}/thumbnail${
    file.content_sha256
      ? `?h=${encodeURIComponent(file.content_sha256)}${
          file.updated_at ? `&u=${encodeURIComponent(file.updated_at)}` : ""
        }`
      : ""
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
