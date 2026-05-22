export type FileCardThumbnailChoice = {
  thumbSvg: string | null;
  finalSource: "localThumb" | "fetchedThumb" | "none";
};

export function chooseFileCardThumbnail(opts: {
  syncState: "synced" | "draft";
  localThumb?: string | null;
  fetchedThumb?: string | null;
}): FileCardThumbnailChoice {
  const localThumb = opts.localThumb ?? null;
  const fetchedThumb = opts.fetchedThumb ?? null;
  const thumbSvg =
    opts.syncState === "draft"
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
