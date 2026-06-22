export type FileCardThumbnailChoice = {
  thumbSvg: string | null;
  finalSource: "localThumb" | "fetchedThumb" | "none";
};

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
  /** Browser-only drafts (local-draft:*) and unsaved server edits both prefer session thumbnails. */
  preferLocalThumb?: boolean;
  /** Excalidraw/MindMap drafts: do not fall back to server thumb while local preview is pending. */
  blockStaleFetchedFallback?: boolean;
  localThumb?: string | null;
  fetchedThumb?: string | null;
  fetchedThumbContentSha?: string | null;
  fileContentSha?: string | null;
}): FileCardThumbnailChoice {
  const localThumb = opts.localThumb ?? null;
  const fetchedThumb = resolveValidFetchedThumb(
    opts.fetchedThumb,
    opts.fetchedThumbContentSha,
    opts.fileContentSha,
  );
  const preferLocal =
    opts.preferLocalThumb ?? opts.syncState === "draft";
  const thumbSvg = preferLocal
    ? localThumb ||
      (opts.blockStaleFetchedFallback ? null : fetchedThumb) ||
      null
    : fetchedThumb || localThumb || null;

  return {
    thumbSvg,
    finalSource: localThumb && thumbSvg === localThumb
      ? "localThumb"
      : fetchedThumb && thumbSvg === fetchedThumb
        ? "fetchedThumb"
        : "none",
  };
}
