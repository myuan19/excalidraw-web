import { useEffect, useRef } from "react";
import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";

import { debugLog } from "../data/debugLog";
import { fetchThumbnailSvgForCard } from "../data/fetchThumbnailSvgForCard";
import type { ForkLocalCacheRecord } from "../data/forkFileTypes";
import type { ServerFile } from "../data/ServerSync";
import { LocalThumbnailCache } from "../data/localThumbnailCache";
import { buildSceneThumbnailSvg } from "../data/thumbnailSvg";

export type ThumbPipelineDraftSlot = {
  syncState?: "synced" | "draft";
  localDraftThumb?: string | null;
  localRecord?: ForkLocalCacheRecord | null;
};

export type ThumbPipelineScopeFile = Pick<
  ServerFile,
  "id" | "content_sha256" | "has_thumbnail"
>;

export type ThumbPipelineDeps = {
  thumbLoadScopeFiles: readonly ServerFile[];
  thumbFetchAllowIds: ReadonlySet<string>;
  draftStateById: Record<string, ThumbPipelineDraftSlot | undefined>;
  fetchedThumbSvgByIdRef: MutableRefObject<Record<string, string>>;
  setDraftThumbs: Dispatch<SetStateAction<Record<string, string>>>;
  setFetchedThumbs: Dispatch<SetStateAction<Record<string, string>>>;
};

/**
 * 卡片缩略图：准入范围由 {@link ../data/thumbCoverage} 计算；
 * 本条 hook 只管「草稿本地生成 SVG」与「GET /thumbnail」两路编排与并发去重。
 */
export function useThumbnailPipeline(deps: ThumbPipelineDeps): {
  thumbFetchingRef: MutableRefObject<Set<string>>;
} {
  const {
    thumbLoadScopeFiles,
    thumbFetchAllowIds,
    draftStateById,
    fetchedThumbSvgByIdRef,
    setDraftThumbs,
    setFetchedThumbs,
  } = deps;

  const thumbFetchingRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const skipped = {
      notInAllowSet: 0,
      localDraftThumb: 0,
      draftNoRecord: 0,
      draftInFlight: 0,
      serverNoThumbFlag: 0,
      alreadyInFetched: 0,
      inFlightRef: 0,
    };
    const toFetch: { id: string; url: string }[] = [];

    for (const f of thumbLoadScopeFiles) {
      if (!thumbFetchAllowIds.has(f.id)) {
        skipped.notInAllowSet++;
        continue;
      }
      const state = draftStateById[f.id];
      const syncState = state?.syncState ?? "synced";
      const localDraftThumb = state?.localDraftThumb ?? null;
      const localRecord = state?.localRecord ?? null;

      if (localDraftThumb) {
        skipped.localDraftThumb++;
        continue;
      }
      if (syncState === "draft") {
        if (!localRecord) {
          skipped.draftNoRecord++;
          continue;
        }
        if (thumbFetchingRef.current.has(f.id)) {
          skipped.draftInFlight++;
          continue;
        }
        thumbFetchingRef.current.add(f.id);
        void (async () => {
          try {
            debugLog.thumbPipeline("draft: buildSceneThumbnailSvg start", {
              id8: f.id.slice(0, 8),
              el: Array.isArray(localRecord.elements)
                ? localRecord.elements.length
                : -1,
            });
            const thumbnail = await buildSceneThumbnailSvg({
              elements: localRecord.elements,
              appState: localRecord.appState,
              files: localRecord.files,
            });
            LocalThumbnailCache.set(f.id, thumbnail);
            debugLog.thumbPipeline("draft: buildSceneThumbnailSvg OK", {
              id8: f.id.slice(0, 8),
              svgLen: thumbnail.length,
            });
            if (mountedRef.current) {
              setDraftThumbs((prev) => ({ ...prev, [f.id]: thumbnail }));
            }
          } catch (err) {
            debugLog.thumbPipeline("draft: buildSceneThumbnailSvg FAILED", {
              id8: f.id.slice(0, 8),
              err: String(err),
            });
          } finally {
            thumbFetchingRef.current.delete(f.id);
          }
        })();
        continue;
      }
      if (!f.has_thumbnail) {
        skipped.serverNoThumbFlag++;
        continue;
      }
      if (thumbFetchingRef.current.has(f.id)) {
        skipped.inFlightRef++;
        continue;
      }
      if (fetchedThumbSvgByIdRef.current[f.id]) {
        skipped.alreadyInFetched++;
        continue;
      }
      toFetch.push({
        id: f.id,
        url: `/api/files/${f.id}/thumbnail${
          f.content_sha256 ? `?h=${encodeURIComponent(f.content_sha256)}` : ""
        }`,
      });
    }

    debugLog.thumbPipeline("thumb effect tick", {
      scopeN: thumbLoadScopeFiles.length,
      allowN: thumbFetchAllowIds.size,
      skipped,
      toFetchN: toFetch.length,
      toFetchIds: toFetch.map((t) => t.id.slice(0, 8)),
    });

    for (const item of toFetch) {
      thumbFetchingRef.current.add(item.id);
      const id8 = item.id.slice(0, 8);
      void fetchThumbnailSvgForCard(item.url, { id8 })
        .then(({ svg, status, errPreview }) => {
          if (!mountedRef.current) {
            debugLog.thumbPipeline("GET thumb ignored (FileList unmounted)", {
              id8,
            });
            return;
          }
          if (!svg) {
            debugLog.thumbnail("GET /thumbnail failed or empty SVG", {
              id8,
              status,
              errPreview,
              url: item.url.slice(0, 160),
            });
            return;
          }
          debugLog.thumbPipeline("setFetchedThumbs apply", {
            id8,
            svgLen: svg.length,
          });
          setFetchedThumbs((prev) => ({ ...prev, [item.id]: svg }));
        })
        .catch((err: unknown) => {
          debugLog.thumbPipeline("GET thumb promise threw", { id8, err: String(err) });
        })
        .finally(() => {
          thumbFetchingRef.current.delete(item.id);
        });
    }
  }, [
    draftStateById,
    thumbLoadScopeFiles,
    thumbFetchAllowIds,
    fetchedThumbSvgByIdRef,
    setDraftThumbs,
    setFetchedThumbs,
  ]);

  return { thumbFetchingRef };
}
