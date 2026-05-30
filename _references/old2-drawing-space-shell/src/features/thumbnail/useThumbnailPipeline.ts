import { useEffect } from "react";
import type { ServerFile } from "@/types/file";
import { fetchThumbnailSvgForCard } from "./fetchThumbnailSvgForCard";
import { ServerThumbnailCache } from "./serverThumbnailCache";
import { getThumbnailPrefetchScope } from "./thumbCoverage";

const MAX_CONCURRENT_FETCHES = 4;

function thumbnailUrl(file: ServerFile) {
  const hash = file.content_sha256 ? `?h=${encodeURIComponent(file.content_sha256)}` : "";
  return `/api/files/${file.id}/thumbnail${hash}`;
}

export function useThumbnailPipeline(files: readonly ServerFile[]) {
  useEffect(() => {
    let cancelled = false;
    const queue = getThumbnailPrefetchScope(files).filter(
      (file) => !ServerThumbnailCache.get(file.id, file.content_sha256),
    );
    let cursor = 0;

    async function worker() {
      while (!cancelled) {
        const file = queue.at(cursor);
        cursor += 1;
        if (!file) return;
        const fetched = await fetchThumbnailSvgForCard(thumbnailUrl(file));
        if (!cancelled && fetched.svg) {
          ServerThumbnailCache.set(file.id, file.content_sha256, fetched.svg);
        }
      }
    }

    void Promise.all(
      Array.from({ length: Math.min(MAX_CONCURRENT_FETCHES, queue.length) }, () => worker()),
    );

    return () => {
      cancelled = true;
    };
  }, [files]);
}
