import { useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { createLogger } from "../lib/logger";
import { devDebug } from "../lib/devDebug";
import { isDesktopEditorHub } from "../lib/runtimePlatform";
import { traceResourceOp } from "../lib/resourceTrace";
import {
  nextThumbPipelineTick,
  traceThumbFetchEnd,
  traceThumbFetchStart,
  traceThumbPipelineTick,
} from "../lib/thumbPipelineTrace";
import { fetchThumbnailSvgForCard } from "../data/fetchThumbnailSvgForCard";
import { patchFileListTreeCacheThumbnailMissing } from "../data/fileListSessionCache";
import { buildServerThumbnailRequestPath } from "../data/serverThumbnailUrl";
import { isLocalDraftFileId } from "../data/localDraftFileId";
import { LocalThumbnailCache } from "../data/localThumbnailCache";
import { isNativeThumbnailPending } from "../data/nativeThumbnailPending";
import { persistSavedThumbnail } from "../data/persistentThumbnailStore";
import {
  markThumbnailServerMiss,
  shouldFetchServerThumbnail,
} from "../data/thumbnailServerFetchMiss";
import { ensureLocalDraftThumbnailFromCache } from "../data/localDraftThumbnailRecovery";
import { buildThumbnailDraftSlot } from "../data/thumbnailLifecycle";
import { shouldAwaitSessionThumbnailBeforeServerFetch } from "../data/resolveFileCardThumbnail";
import type { ServerFile } from "../data/ServerSync";

const logPipe = createLogger({ module: "thumbPipeline" });

/**
 * 列表 GET /thumbnail 并发上限（冷启动亦适用，避免 PriorityTaskQueue 串行逐张加载）。
 * Web 取较小值：既比串行快，又保留缩略图先后到达的「逐个浮现」节奏，不一次性全部刷出。
 */
export const THUMB_SERVER_FETCH_CONCURRENCY = 3;

/**
 * 桌面端上限：请求走 IPC → loopback Express（本地磁盘读），没有网络成本，
 * 低并发只会拉长冷启动首屏；「浮现」节奏由入场动画负责，不用网络节流实现。
 * 常态下持久层水合已覆盖大多数卡片，真正走到拉取的只有内容变化的少数文件。
 */
export const THUMB_SERVER_FETCH_CONCURRENCY_DESKTOP = 10;

function defaultThumbFetchConcurrency(): number {
  return isDesktopEditorHub()
    ? THUMB_SERVER_FETCH_CONCURRENCY_DESKTOP
    : THUMB_SERVER_FETCH_CONCURRENCY;
}

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
  maxConcurrentFetches?: number;
  fetchEnabled?: boolean;
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
    maxConcurrentFetches = defaultThumbFetchConcurrency(),
    fetchEnabled = true,
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
    if (!fetchEnabled) {
      return;
    }
    const tick = nextThumbPipelineTick();
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
    }

    traceThumbPipelineTick({
      tick,
      scopeN: thumbLoadScopeFiles.length,
      allowN: thumbFetchAllowIds.size,
      fetchedN: Object.keys(fetchedThumbSvgByIdRef.current).length,
      inFlightN: thumbFetchingRef.current.size,
      toFetchN: toFetch.length,
      toFetchIds8: toFetch.map((t) => t.id.slice(0, 8)),
      skipped,
    });
    traceResourceOp("thumbnail", "effectTick", "ok", {
      scopeN: thumbLoadScopeFiles.length,
      allowN: thumbFetchAllowIds.size,
      toFetchN: toFetch.length,
    });
    debugThumbnailPipeline("effect tick", {
      tick,
      scopeN: thumbLoadScopeFiles.length,
      allowN: thumbFetchAllowIds.size,
      skipped,
      toFetchN: toFetch.length,
      toFetchIds: toFetch.map((t) => t.id.slice(0, 8)),
    });

    const fetchRunners: Array<() => Promise<void>> = [];

    for (const item of toFetch) {
      const alreadyInflight = thumbFetchingRef.current.has(item.id);
      thumbFetchingRef.current.add(item.id);
      const id8 = item.id.slice(0, 8);
      traceThumbFetchStart({
        fileId: item.id,
        tick,
        cacheKey: item.cacheKey,
        contentSha8: item.contentSha?.slice(0, 8) ?? null,
        alreadyInflight,
      });
      const fetchStartedAt = performance.now();

      const runFetch = async () => {
        try {
          const { svg, status, errPreview } = await fetchThumbnailSvgForCard(
            item.url,
            { id8 },
          );
          const ms = performance.now() - fetchStartedAt;
          if (!mountedRef.current) {
            traceThumbFetchEnd({
              fileId: item.id,
              tick,
              outcome: "unmounted",
              ms,
              status,
            });
            return;
          }
          if (fileThumbHashByIdRef.current[item.id] !== item.cacheKey) {
            const currentHash = fileThumbHashByIdRef.current[item.id];
            const contentStillMatches =
              item.contentSha &&
              currentHash === item.contentSha &&
              item.cacheKey === item.contentSha;
            if (!contentStillMatches) {
              traceThumbFetchEnd({
                fileId: item.id,
                tick,
                outcome: "stale",
                ms,
                status,
                detail: {
                  fetchedHash: item.cacheKey,
                  currentHash,
                },
              });
              logPipe.warn("GET thumb ignored (stale content hash)", {
                id8,
                fetchedHash: item.cacheKey,
                currentHash,
                contentSha8: item.contentSha?.slice(0, 8) ?? null,
              });
              return;
            }
            logPipe.info("GET thumb apply despite hash drift (same content)", {
              id8,
              fetchedHash: item.cacheKey,
              currentHash,
            });
          }
          if (!svg) {
            traceThumbFetchEnd({
              fileId: item.id,
              tick,
              outcome: status >= 400 ? "fail" : "empty",
              ms,
              status,
              detail: { errPreview: errPreview?.slice(0, 120) },
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
          fetchedThumbHashByIdRef.current[item.id] = item.cacheKey;
          setFetchedThumbs((prev) => ({ ...prev, [item.id]: svg }));
          // 桌面端：拉到的 contentSha 绑定图落持久层，下次启动免拉（web no-op）。
          persistSavedThumbnail(item.id, item.contentSha, svg);
          traceThumbFetchEnd({
            fileId: item.id,
            tick,
            outcome: "apply",
            ms,
            status,
            svgLen: svg.length,
          });
        } catch (err: unknown) {
          traceThumbFetchEnd({
            fileId: item.id,
            tick,
            outcome: "error",
            ms: performance.now() - fetchStartedAt,
            detail: {
              error: err instanceof Error ? err.message : String(err),
            },
          });
          logPipe.debug("GET thumb promise threw", { id8, err: String(err) });
        } finally {
          thumbFetchingRef.current.delete(item.id);
        }
      };

      fetchRunners.push(runFetch);
    }

    const concurrency = Math.max(
      1,
      Math.min(maxConcurrentFetches, fetchRunners.length || 1),
    );
    let nextIndex = 0;
    let activeCount = 0;

    const pumpFetches = () => {
      while (activeCount < concurrency && nextIndex < fetchRunners.length) {
        const run = fetchRunners[nextIndex++]!;
        activeCount += 1;
        void run().finally(() => {
          activeCount -= 1;
          pumpFetches();
        });
      }
    };
    pumpFetches();
  }, [
    draftStateById,
    fetchEnabled,
    maxConcurrentFetches,
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
