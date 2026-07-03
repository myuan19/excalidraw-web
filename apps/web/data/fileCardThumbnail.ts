import { traceThumbChoiceReject } from "../lib/thumbPipelineTrace";

import { isLocalDraftFileId } from "./localDraftFileId";
import { LocalThumbnailCache } from "./localThumbnailCache";
import { isTrustedWarmLocalThumbnailSvg } from "./thumbnailSvg";

export type FileCardThumbnailChoice = {
  thumbSvg: string | null;
  finalSource: "localThumb" | "fetchedThumb" | "none";
};

/**
 * 文件列表卡片本地缩略图策略（单一真相来源）。
 *
 * - live-draft-preview：浏览器 local-draft，列表跟 session 实时预览。
 * - draft-preview-until-sync：已入库文件未保存，优先展示当前草稿会话预览
 *   （用户「上一次修改」的样子），取不到再回落上次已保存图；角标标未保存。
 * - synced-session：已同步，可用 contentSha 绑定的 session 缩略图。
 */
export type FileListCardLocalThumbPolicy =
  | "live-draft-preview"
  | "draft-preview-until-sync"
  | "synced-session";

export function resolveFileListCardLocalThumbPolicy(
  fileId: string,
  syncState: "synced" | "draft",
): FileListCardLocalThumbPolicy {
  if (isLocalDraftFileId(fileId)) {
    return "live-draft-preview";
  }
  if (syncState === "draft") {
    return "draft-preview-until-sync";
  }
  return "synced-session";
}

/** 按列表策略从 LocalThumbnailCache 读取本地缩略图。 */
export function resolveListCardLocalThumb(opts: {
  fileId: string;
  policy: FileListCardLocalThumbPolicy;
  draftHash?: string | null;
  contentSha?: string | null;
}): string | null {
  const { fileId, policy, draftHash, contentSha } = opts;
  switch (policy) {
    case "live-draft-preview":
      return (
        LocalThumbnailCache.getDraftPreview(fileId, draftHash) ??
        LocalThumbnailCache.getDraftSvg(fileId)
      );
    case "draft-preview-until-sync":
      // 草稿态展示顺序：当前 draftHash 精确匹配的预览 → 会话内最近一次草稿
      // 导出（450ms 防抖导出天然落后当前 hash 一拍，但仍新于上次保存）→
      // 上次已保存图。草稿槽只在编辑会话中写入且保存后与基线内容一致，
      // 因此会话内它恒不旧于 saved 槽，直接优先是安全的。
      return (
        LocalThumbnailCache.getDraftPreview(fileId, draftHash) ??
        LocalThumbnailCache.getDraftSvg(fileId) ??
        LocalThumbnailCache.getSavedContentThumb(fileId, contentSha)
      );
    case "synced-session": {
      const bound = LocalThumbnailCache.getSavedContentThumb(fileId, contentSha);
      if (bound) {
        return bound;
      }
      if (contentSha) {
        return null;
      }
      const cached = LocalThumbnailCache.getDraftSvg(fileId);
      return cached && isTrustedWarmLocalThumbnailSvg(cached) ? cached : null;
    }
    default:
      return null;
  }
}

/** Ignore fetched SVG when its content hash does not match the file record. */
export function resolveValidFetchedThumb(
  fetchedThumb: string | null | undefined,
  fetchedThumbContentSha: string | null | undefined,
  fileContentSha: string | null | undefined,
): string | null {
  if (!fetchedThumb) {
    return null;
  }
  if (!fileContentSha) {
    return fetchedThumb;
  }
  if (fetchedThumbContentSha == null) {
    return null;
  }
  return fetchedThumbContentSha === fileContentSha ? fetchedThumb : null;
}

export function chooseFileCardThumbnail(opts: {
  fileId?: string;
  syncState: "synced" | "draft";
  listLocalPolicy: FileListCardLocalThumbPolicy;
  /** 是否优先本地槽（与 syncState / policy 一致，供 pipeline 判断 stale fetch）。 */
  preferLocalThumb?: boolean;
  localThumb?: string | null;
  fetchedThumb?: string | null;
  fetchedThumbContentSha?: string | null;
  fileContentSha?: string | null;
}): FileCardThumbnailChoice {
  const localThumb = opts.localThumb ?? null;
  const validFetched = resolveValidFetchedThumb(
    opts.fetchedThumb,
    opts.fetchedThumbContentSha,
    opts.fileContentSha,
  );
  if (
    opts.fetchedThumb &&
    !validFetched &&
    opts.fileContentSha &&
    opts.fetchedThumbContentSha != null &&
    opts.fetchedThumbContentSha !== opts.fileContentSha
  ) {
    traceThumbChoiceReject({
      fileId8: opts.fileId ? opts.fileId.slice(0, 8) : "unknown",
      reason: "fetched-hash-mismatch",
      fetchedLen: opts.fetchedThumb.length,
      fetchedHash8: opts.fetchedThumbContentSha.slice(0, 8),
      fileHash8: opts.fileContentSha.slice(0, 8),
    });
  } else if (opts.fetchedThumb && !validFetched && opts.fileContentSha) {
    traceThumbChoiceReject({
      fileId8: opts.fileId ? opts.fileId.slice(0, 8) : "unknown",
      reason: "fetched-hash-missing",
      fetchedLen: opts.fetchedThumb.length,
      fetchedHash8: opts.fetchedThumbContentSha?.slice(0, 8) ?? null,
      fileHash8: opts.fileContentSha.slice(0, 8),
    });
  }
  const allowStaleFetchedFallback =
    opts.listLocalPolicy === "draft-preview-until-sync";
  const blockStaleFetchedFallback =
    opts.listLocalPolicy === "live-draft-preview" &&
    (opts.preferLocalThumb ?? opts.syncState === "draft");
  const fetchedThumb =
    validFetched ??
    (allowStaleFetchedFallback && opts.fetchedThumb ? opts.fetchedThumb : null);
  const preferLocal =
    opts.preferLocalThumb ?? opts.syncState === "draft";
  const canUseFetchedWhenLocalMissing =
    !blockStaleFetchedFallback || allowStaleFetchedFallback;
  const thumbSvg = preferLocal
    ? localThumb ||
      (canUseFetchedWhenLocalMissing ? fetchedThumb : null) ||
      null
    : localThumb || fetchedThumb || null;

  return {
    thumbSvg,
    finalSource:
      localThumb && thumbSvg === localThumb
        ? "localThumb"
        : fetchedThumb && thumbSvg === fetchedThumb
          ? "fetchedThumb"
          : "none",
  };
}
