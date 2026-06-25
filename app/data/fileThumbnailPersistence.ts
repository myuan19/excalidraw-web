import { createLogger } from "../lib/logger";

import { ServerSync, ServerSyncError } from "./ServerSync";
import { LocalThumbnailCache } from "./localThumbnailCache";
import {
  finalizeSavedThumbnail,
  finalizeSavedThumbnailMetadata,
} from "./thumbnailLifecycle";
import {
  getPendingSavedFileThumbnailContentSha,
  hasPendingSavedFileThumbnail,
  markPendingSavedFileThumbnail,
} from "./sessionFileThumbnail";
import { thumbnailSvgHasVisibleContent } from "./thumbnailSvg";
import { logPerf, markPerfNow, perfDurationMs } from "../lib/perfLog";

import type { SavedThumbnailPatch } from "./thumbnailLifecycle";
import type { SaveToServerSource } from "../hooks/types";

const log = createLogger({ module: "thumbnail" });

const pendingUploads = new Map<string, string>();

function isGeneratedThumbnailCurrent(
  fileId: string,
  contentSha: string,
): boolean {
  const pendingContentSha = getPendingSavedFileThumbnailContentSha(fileId);
  return !pendingContentSha || pendingContentSha === contentSha;
}

function markThumbnailGenerationPending(
  opts: SavedThumbnailPatch & { source: SaveToServerSource },
): string | null {
  if (opts.contentSha) {
    markPendingSavedFileThumbnail(opts.fileId, opts.contentSha);
  }
  logPerf("thumbnail.pending", {
    fileId8: opts.fileId.slice(0, 8),
    source: opts.source,
    contentSha8: opts.contentSha?.slice(0, 8) ?? null,
    version: opts.version ?? null,
  });
  return finalizeSavedThumbnailMetadata(opts);
}

function completeGeneratedThumbnailLocally(
  opts: SavedThumbnailPatch & {
    source: SaveToServerSource;
    thumbnail: string;
    contentSha: string;
  },
): string | null {
  if (!isGeneratedThumbnailCurrent(opts.fileId, opts.contentSha)) {
    const pendingContentSha = getPendingSavedFileThumbnailContentSha(opts.fileId);
    log.info("async upload dropped stale generated thumbnail", {
      fileId8: opts.fileId.slice(0, 8),
      source: opts.source,
      contentSha8: opts.contentSha.slice(0, 8),
      pendingSha8: pendingContentSha?.slice(0, 8) ?? null,
    });
    return null;
  }
  return finalizeSavedThumbnail(opts);
}

function queueServerThumbnailUpload(
  opts: SavedThumbnailPatch & {
    source: SaveToServerSource;
    thumbnail: string;
    contentSha: string;
  },
): void {
  const uploadKey = `${opts.fileId}:${opts.contentSha}`;
  if (pendingUploads.get(opts.fileId) === uploadKey) {
    return;
  }
  pendingUploads.set(opts.fileId, uploadKey);
  const uploadStartedAt = markPerfNow();
  logPerf("thumbnail.upload_queued", {
    fileId8: opts.fileId.slice(0, 8),
    source: opts.source,
    contentSha8: opts.contentSha.slice(0, 8),
    thumbLen: opts.thumbnail.length,
    version: opts.version ?? null,
  });
  log.info("async upload queued", {
    fileId8: opts.fileId.slice(0, 8),
    source: opts.source,
    contentSha8: opts.contentSha.slice(0, 8),
    thumbLen: opts.thumbnail.length,
  });

  void ServerSync.saveFileThumbnail(opts.fileId, opts.thumbnail, {
    contentSha256: opts.contentSha,
    source: `${opts.source}-thumbnail`,
  })
    .then((result) => {
      if (
        result.content_sha256 === opts.contentSha &&
        isGeneratedThumbnailCurrent(opts.fileId, opts.contentSha)
      ) {
        finalizeSavedThumbnail({
          ...opts,
          contentSha: result.content_sha256,
          version: result.version ?? opts.version,
          updatedAt: result.updated_at ?? opts.updatedAt,
          thumbnail: opts.thumbnail,
        });
        window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
      }
      log.info("async upload complete", {
        fileId8: opts.fileId.slice(0, 8),
        source: opts.source,
        contentSha8: opts.contentSha.slice(0, 8),
        serverSha8: result.content_sha256?.slice(0, 8) ?? null,
      });
      logPerf("thumbnail.upload_done", {
        fileId8: opts.fileId.slice(0, 8),
        source: opts.source,
        contentSha8: opts.contentSha.slice(0, 8),
        serverSha8: result.content_sha256?.slice(0, 8) ?? null,
        uploadMs: perfDurationMs(uploadStartedAt),
        version: result.version ?? opts.version ?? null,
      });
    })
    .catch((error) => {
      const stale =
        error instanceof ServerSyncError &&
        error.status === 409 &&
        error.body.includes("stale_thumbnail");
      log.event(
        stale ? "info" : "warn",
        "thumbnail.async_upload_failed",
        "async upload failed",
        {
          fields: {
            fileId8: opts.fileId.slice(0, 8),
            source: opts.source,
            contentSha8: opts.contentSha.slice(0, 8),
            stale,
            message: error instanceof Error ? error.message : String(error),
          },
        },
      );
      logPerf(
        "thumbnail.upload_failed",
        {
          fileId8: opts.fileId.slice(0, 8),
          source: opts.source,
          contentSha8: opts.contentSha.slice(0, 8),
          uploadMs: perfDurationMs(uploadStartedAt),
          stale,
          message: error instanceof Error ? error.message : String(error),
        },
        stale ? "info" : "warn",
      );
    })
    .finally(() => {
      if (pendingUploads.get(opts.fileId) === uploadKey) {
        pendingUploads.delete(opts.fileId);
      }
    });
}

export function scheduleSavedFileThumbnailUpload(
  opts: SavedThumbnailPatch & {
    source: SaveToServerSource;
    thumbnail?: string | null;
    documentHash?: string | null;
  },
): string | null {
  const { contentSha } = opts;
  const hasDirectThumbnail =
    typeof opts.thumbnail === "string" && opts.thumbnail.length > 0;
  const draftThumbnail = hasDirectThumbnail
    ? null
    : LocalThumbnailCache.getForDraft(opts.fileId, opts.documentHash);
  const thumbnail = opts.thumbnail ?? draftThumbnail;
  logPerf("thumbnail.schedule", {
    fileId8: opts.fileId.slice(0, 8),
    source: opts.source,
    contentSha8: contentSha?.slice(0, 8) ?? null,
    documentHash8: opts.documentHash?.slice(0, 8) ?? null,
    hasDirectThumbnail,
    draftThumbHit: !!draftThumbnail,
    thumbLen: typeof thumbnail === "string" ? thumbnail.length : 0,
    version: opts.version ?? null,
  });
  if (!contentSha || !thumbnail || !thumbnailSvgHasVisibleContent(thumbnail)) {
    return markThumbnailGenerationPending(opts);
  }

  const localThumbnail = completeGeneratedThumbnailLocally({
    ...opts,
    contentSha,
    thumbnail,
  });
  if (!localThumbnail) {
    return null;
  }

  queueServerThumbnailUpload({
    ...opts,
    contentSha,
    thumbnail,
  });
  return localThumbnail;
}

/** Wait until a post-save thumbnail upload finishes or is no longer expected. */
export function whenSavedThumbnailUploadSettled(
  fileId: string,
  contentSha: string | null | undefined,
  timeoutMs = 8000,
): Promise<void> {
  if (!contentSha) {
    return Promise.resolve();
  }
  const uploadKey = `${fileId}:${contentSha}`;
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const pending = hasPendingSavedFileThumbnail(fileId, contentSha);
      const inFlight = pendingUploads.get(fileId) === uploadKey;
      if (!pending && !inFlight) {
        resolve();
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        logPerf("thumbnail.wait_timeout", {
          fileId8: fileId.slice(0, 8),
          contentSha8: contentSha.slice(0, 8),
          pending,
          inFlight,
        });
        resolve();
        return;
      }
      setTimeout(tick, 100);
    };
    tick();
  });
}
