export type FileCardThumbnailChoice = {
  thumbSvg: string | null;
  finalSource: "localThumb" | "fetchedThumb" | "none";
};

export function chooseFileCardThumbnail(opts: {
  syncState?: "synced" | "draft" | "temp";
  localThumb?: string | null;
  fetchedThumb?: string | null;
}): FileCardThumbnailChoice {
  const localThumb = opts.localThumb ?? null;
  const fetchedThumb = opts.fetchedThumb ?? null;
  const preferLocal = opts.syncState === "draft" || opts.syncState === "temp";
  const thumbSvg = preferLocal
    ? localThumb || fetchedThumb
    : fetchedThumb || localThumb;

  return {
    thumbSvg: thumbSvg ?? null,
    finalSource: localThumb && thumbSvg === localThumb
      ? "localThumb"
      : fetchedThumb && thumbSvg === fetchedThumb
        ? "fetchedThumb"
        : "none",
  };
}
