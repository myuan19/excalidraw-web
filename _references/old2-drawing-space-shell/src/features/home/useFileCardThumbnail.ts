import { useEffect, useState } from "react";
import {
  chooseFileCardThumbnail,
  fetchThumbnailSvgForCard,
  LocalThumbnailCache,
  patchThumbnailSvgForCard,
  ServerThumbnailCache,
  svgToObjectUrl,
} from "@/features/thumbnail";
import { getFileBadge, type FileBadge } from "@/features/files/fileBadgeState";
import { isLocalTempFileId } from "@/features/tempFiles/tempFileId";
import type { ServerFile } from "@/types/file";

export function useFileCardThumbnail(file: ServerFile, badge?: FileBadge) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const resolvedBadge = badge ?? getFileBadge(file.id);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    const isTemp = isLocalTempFileId(file.id);
    if (!file.has_thumbnail && !isTemp) {
      setThumbUrl(null);
      return undefined;
    }

    const load = async () => {
      const localThumb = LocalThumbnailCache.get(file.id);
      const cachedThumb = !isTemp
        ? ServerThumbnailCache.get(file.id, file.content_sha256)
        : null;
      const fetched = isTemp
        ? { svg: null as string | null }
        : cachedThumb
          ? { svg: cachedThumb }
          : await fetchThumbnailSvgForCard(
            `/api/files/${file.id}/thumbnail${file.content_sha256 ? `?h=${file.content_sha256}` : ""}`,
          );
      if (cancelled) return;
      ServerThumbnailCache.set(file.id, file.content_sha256, fetched.svg);
      const choice = chooseFileCardThumbnail({
        syncState: resolvedBadge === "synced" ? "synced" : resolvedBadge,
        localThumb,
        fetchedThumb: fetched.svg,
      });
      const displaySvg = choice.thumbSvg && file.kind === "mindmap"
        ? patchThumbnailSvgForCard(choice.thumbSvg)
        : choice.thumbSvg;
      objectUrl = displaySvg ? svgToObjectUrl(displaySvg) : null;
      setThumbUrl(objectUrl);
    };

    void load();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.content_sha256, file.has_thumbnail, file.id, file.kind, resolvedBadge]);

  return thumbUrl;
}
