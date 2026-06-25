import { useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { createLogger } from "../lib/logger";
import { devDebug } from "../lib/devDebug";
import { traceThumb } from "../lib/interactionDebugTrace";
import { traceResourceOp } from "../lib/resourceTrace";
import { fetchThumbnailSvgForCard } from "../data/fetchThumbnailSvgForCard";
import { patchFileListTreeCacheThumbnailMissing } from "../data/fileListSessionCache";
import { buildServerThumbnailRequestPath } from "../data/serverThumbnailUrl";
import { isLocalDraftFileId } from "../data/localDraftFileId";
import { LocalThumbnailCache } from "../data/localThumbnailCache";
import { isNativeThumbnailPending } from "../data/nativeThumbnailPending";
import {
  markThumbnailServerMiss,
  shouldFetchServerThumbnail,
} from "../data/thumbnailServerFetchMiss";
import { ensureLocalDraftThumbnailFromCache } from "../data/localDraftThumbnailRecovery";
import { buildThumbnailDraftSlot } from "../data/thumbnailLifecycle";
import { shouldAwaitSessionThumbnailBeforeServerFetch } from "../data/resolveFileCardThumbnail";
import type { ServerFile } from "../data/ServerSync";

const logPipe = createLogger({ module: "thumbPipeline" });
const logThumb = createLogger({ module: "thumbnail" });

function debugThumbnailPipeline(
  label: string,
  data: Record<string, unknown>,
): void {
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
      localContentThumb: 0,
      draftSessionThumbPending: 0,
      localDraftRecoverQueued: 0,
      serverNoThumbFlag: 0,
      serverThumbMiss: 0,
      alreadyInFetched: 0,
      inFlightRef: 0,
    };
    const toFetch: {
      id: string;
      url: string;
      contentSha: string | null;
      cacheKey: string | null;
    }[] = [];

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
      const warmedLocalThumb = LocalThumbnailCache.getForContent(
        f.id,
        f.content_sha256,
      );
      if (warmedLocalThumb) {
        debugThumbnailPipeline("skip content-bound local thumb", {
          id: f.id,
          id8: f.id.slice(0, 8),
          syncState,
          localThumbLen: warmedLocalThumb.length,
        });
        skipped.localContentThumb++;
        continue;
      }
      if (isNativeThumbnailPending(f.id)) {
        debugThumbnailPipeline("skip native thumbnail in flight", {
          id: f.id,
          id8: f.id.slice(0, 8),
          syncState,
        });
        skipped.localContentThumb++;
        continue;
      }
      if (
        shouldAwaitSessionThumbnailBeforeServerFetch(
          f,
          buildThumbnailDraftSlot(f),
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
      const cacheKey = fileThumbHashByIdRef.current[f.id] ?? contentSha;
      if (
        fetchedThumbSvgByIdRef.current[f.id] &&
        fetchedThumbHashByIdRef.current[f.id] === cacheKey
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
        cacheKey,
        url: buildServerThumbnailRequestPath(f.id, f),
      });
      traceThumb("pipeline.queueFetch", {
        fileId8: f.id.slice(0, 8),
        contentSha8: contentSha?.slice(0, 8) ?? null,
        syncState,
      });
    }

    logPipe.debug("thumb effect tick", {
      scopeN: thumbLoadScopeFiles.length,
      allowN: thumbFetchAllowIds.size,
      skipped,
      toFetchN: toFetch.length,
      toFetchIds: toFetch.map((t) => t.id.slice(0, 8)),
    });
    traceResourceOp("thumbnail", "effectTick", "ok", {
      scopeN: thumbLoadScopeFiles.length,
      allowN: thumbFetchAllowIds.size,
      toFetchN: toFetch.length,
    });
    traceThumb("pipeline.tick", {
      scopeN: thumbLoadScopeFiles.length,
      allowN: thumbFetchAllowIds.size,
      toFetchN: toFetch.length,
      toFetchIds8: toFetch.map((t) => t.id.slice(0, 8)),
      skipped,
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
          if (fileThumbHashByIdRef.current[item.id] !== item.cacheKey) {
            logPipe.debug("GET thumb ignored (stale content hash)", {
              id8,
              fetchedHash: item.cacheKey,
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
          fetchedThumbHashByIdRef.current[item.id] = item.cacheKey;
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
