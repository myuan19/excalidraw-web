import { useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { createLogger } from "../lib/logger";
import { devDebug, isDevDebugChannelEnabled } from "../lib/devDebug";
import { fetchThumbnailSvgForCard } from "../data/fetchThumbnailSvgForCard";
import { patchFileListTreeCacheThumbnailMissing } from "../data/fileListSessionCache";
import { isLocalDraftFileId } from "../data/localDraftFileId";
import {
  markThumbnailServerMiss,
  shouldFetchServerThumbnail,
} from "../data/thumbnailServerFetchMiss";
import { ensureLocalDraftThumbnailFromCache } from "../data/localDraftThumbnailRecovery";
import { shouldAwaitSessionThumbnailBeforeServerFetch } from "../data/resolveFileCardThumbnail";
import type { ServerFile } from "../data/ServerSync";

const logPipe = createLogger({ module: "thumbPipeline" });
const logThumb = createLogger({ module: "thumbnail" });

function isThumbnailPipelineDebugEnabled(): boolean {
  if (isDevDebugChannelEnabled("thumbnail-pipeline")) {
    return true;
  }
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return (
      window.localStorage.getItem("excalidraw-web-debug-thumbnail-pipeline") ===
      "1"
    );
  } catch {
    return false;
  }
}

function debugThumbnailPipeline(
  label: string,
  data: Record<string, unknown>,
): void {
  if (!isThumbnailPipelineDebugEnabled()) {
    return;
  }
  devDebug("thumbnail-pipeline", label, data);
}

export type ThumbPipelineDraftSlot = {
  syncState?: "synced" | "draft";
  localDraftThumb?: string | null;
};

export type ThumbPipelineDeps = {
  thumbLoadScopeFiles: readonly ServerFile[];
  thumbFetchAllowIds: ReadonlySet<string>;
  draftStateById: Record<string, ThumbPipelineDraftSlot | undefined>;
  fetchedThumbSvgByIdRef: MutableRefObject<Record<string, string>>;
  fetchedThumbHashByIdRef: MutableRefObject<Record<string, string | null>>;
  fileThumbHashByIdRef: MutableRefObject<Record<string, string | null>>;
  setFetchedThumbs: Dispatch<SetStateAction<Record<string, string>>>;
  onThumbnailServerMiss?: (fileId: string, contentSha: string | null) => void;
};

/**
 * 卡片缩略图：准入范围由 {@link ../data/thumbCoverage} 计算；
 * 草稿缩略图由编辑侧写入 sessionStorage，本 hook 只拉 GET /thumbnail。
 */
export function useThumbnailPipeline(deps: ThumbPipelineDeps): {
  thumbFetchingRef: MutableRefObject<Set<string>>;
} {
  const {
    thumbLoadScopeFiles,
    thumbFetchAllowIds,
    draftStateById,
    fetchedThumbSvgByIdRef,
    fetchedThumbHashByIdRef,
    fileThumbHashByIdRef,
    setFetchedThumbs,
    onThumbnailServerMiss,
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
      draftSessionThumbPending: 0,
      localDraftRecoverQueued: 0,
      serverNoThumbFlag: 0,
      serverThumbMiss: 0,
      alreadyInFetched: 0,
      inFlightRef: 0,
    };
    const toFetch: { id: string; url: string; contentSha: string | null }[] = [];

    for (const f of thumbLoadScopeFiles) {
      if (!thumbFetchAllowIds.has(f.id)) {
        debugThumbnailPipeline("skip not in allow set", {
          id: f.id,
          id8: f.id.slice(0, 8),
          hasThumbnail: !!f.has_thumbnail,
          contentSha: f.content_sha256 ?? null,
        });
        skipped.notInAllowSet++;
        continue;
      }
      const state = draftStateById[f.id];
      const syncState = state?.syncState ?? "synced";
      const localDraftThumb = state?.localDraftThumb ?? null;

      if (localDraftThumb) {
        debugThumbnailPipeline("skip existing local draft thumb", {
          id: f.id,
          id8: f.id.slice(0, 8),
          syncState,
          localDraftThumbLen: localDraftThumb.length,
        });
        skipped.localDraftThumb++;
        continue;
      }
      if (
        shouldAwaitSessionThumbnailBeforeServerFetch(
          f,
          syncState,
          localDraftThumb,
        )
      ) {
        debugThumbnailPipeline("skip draft session thumb pending", {
          id: f.id,
          id8: f.id.slice(0, 8),
          syncState,
          kind: f.kind,
        });
        skipped.draftSessionThumbPending++;
        continue;
      }
      if (isLocalDraftFileId(f.id)) {
        if (!thumbFetchingRef.current.has(f.id)) {
          thumbFetchingRef.current.add(f.id);
          skipped.localDraftRecoverQueued++;
          void ensureLocalDraftThumbnailFromCache(f.id, f.kind).finally(() => {
            thumbFetchingRef.current.delete(f.id);
          });
        } else {
          skipped.inFlightRef++;
        }
        continue;
      }
      if (!shouldFetchServerThumbnail(f.id, f)) {
        if (!f.has_thumbnail) {
          debugThumbnailPipeline("skip server no thumbnail", {
            id: f.id,
            id8: f.id.slice(0, 8),
            syncState,
            contentSha: f.content_sha256 ?? null,
          });
          skipped.serverNoThumbFlag++;
        } else {
          debugThumbnailPipeline("skip server thumbnail miss", {
            id: f.id,
            id8: f.id.slice(0, 8),
            syncState,
            contentSha: f.content_sha256 ?? null,
          });
          skipped.serverThumbMiss++;
        }
        continue;
      }
      if (thumbFetchingRef.current.has(f.id)) {
        debugThumbnailPipeline("skip in flight", {
          id: f.id,
          id8: f.id.slice(0, 8),
          syncState,
        });
        skipped.inFlightRef++;
        continue;
      }
      const contentSha = f.content_sha256 ?? null;
      if (
        fetchedThumbSvgByIdRef.current[f.id] &&
        fetchedThumbHashByIdRef.current[f.id] === contentSha
      ) {
        skipped.alreadyInFetched++;
        continue;
      }
      debugThumbnailPipeline("queue server thumbnail fetch", {
        id: f.id,
        id8: f.id.slice(0, 8),
        syncState,
        contentSha,
        hasThumbnail: !!f.has_thumbnail,
      });
      toFetch.push({
        id: f.id,
        contentSha,
        url: `/api/files/${f.id}/thumbnail${
          f.content_sha256 ? `?h=${encodeURIComponent(f.content_sha256)}` : ""
        }`,
      });
    }

    logPipe.debug("thumb effect tick", {
      scopeN: thumbLoadScopeFiles.length,
      allowN: thumbFetchAllowIds.size,
      skipped,
      toFetchN: toFetch.length,
      toFetchIds: toFetch.map((t) => t.id.slice(0, 8)),
    });
    debugThumbnailPipeline("effect tick", {
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
            logPipe.debug("GET thumb ignored (FileList unmounted)", {
              id8,
            });
            return;
          }
          if (fileThumbHashByIdRef.current[item.id] !== item.contentSha) {
            logPipe.debug("GET thumb ignored (stale content hash)", {
              id8,
              fetchedHash: item.contentSha,
              currentHash: fileThumbHashByIdRef.current[item.id],
            });
            return;
          }
          if (!svg) {
            debugThumbnailPipeline("GET thumb empty/failed", {
              id: item.id,
              id8,
              status,
              errPreview,
            });
            logThumb.debug("GET /thumbnail failed or empty SVG", {
              id8,
              status,
              errPreview,
              url: item.url.slice(0, 160),
            });
            if (
              status === 404 &&
              markThumbnailServerMiss(item.id, item.contentSha)
            ) {
              patchFileListTreeCacheThumbnailMissing(item.id, item.contentSha);
              onThumbnailServerMiss?.(item.id, item.contentSha);
            }
            return;
          }
          logPipe.debug("setFetchedThumbs apply", {
            id8,
            svgLen: svg.length,
          });
          debugThumbnailPipeline("GET thumb OK", {
            id: item.id,
            id8,
            svgLen: svg.length,
            contentSha: item.contentSha,
          });
          fetchedThumbHashByIdRef.current[item.id] = item.contentSha;
          setFetchedThumbs((prev) => ({ ...prev, [item.id]: svg }));
        })
        .catch((err: unknown) => {
          debugThumbnailPipeline("GET thumb threw", {
            id: item.id,
            id8,
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
          });
          logPipe.debug("GET thumb promise threw", { id8, err: String(err) });
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
    fetchedThumbHashByIdRef,
    fileThumbHashByIdRef,
    onThumbnailServerMiss,
    setFetchedThumbs,
  ]);

  return { thumbFetchingRef };
}
