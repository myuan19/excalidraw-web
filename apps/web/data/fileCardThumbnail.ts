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
 * - last-saved-until-sync：已入库文件未保存，列表固定展示上次已保存图，角标标未保存。
 * - synced-session：已同步，可用 contentSha 绑定的 session 缩略图。
 */
export type FileListCardLocalThumbPolicy =
  | "live-draft-preview"
  | "last-saved-until-sync"
  | "synced-session";

export function resolveFileListCardLocalThumbPolicy(
  fileId: string,
  syncState: "synced" | "draft",
): FileListCardLocalThumbPolicy {
  if (isLocalDraftFileId(fileId)) {
    return "live-draft-preview";
  }
  if (syncState === "draft") {
    return "last-saved-until-sync";
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
    case "last-saved-until-sync":
      return LocalThumbnailCache.getSavedContentThumb(fileId, contentSha);
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
  const allowStaleFetchedFallback =
    opts.listLocalPolicy === "last-saved-until-sync";
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
