export type FileCardThumbnailChoice = {
  thumbSvg: string | null;
  finalSource: "localThumb" | "fetchedThumb" | "none";
};

export function chooseFileCardThumbnail(opts: {
  syncState: "synced" | "draft";
  /** Browser-only drafts (local-draft:*) and unsaved server edits both prefer session thumbnails. */
  preferLocalThumb?: boolean;
  localThumb?: string | null;
  fetchedThumb?: string | null;
}): FileCardThumbnailChoice {
  const localThumb = opts.localThumb ?? null;
  const fetchedThumb = opts.fetchedThumb ?? null;
  const preferLocal =
    opts.preferLocalThumb ?? opts.syncState === "draft";
  const thumbSvg = preferLocal
    ? localThumb || fetchedThumb || null
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
