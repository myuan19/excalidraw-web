/**
 * Client-side SVG preview for unsaved file-list cards.
 * Session-scoped so it can override the server thumbnail while a local draft exists.
 */

import { createLogger } from "../lib/logger";

const logThumb = createLogger({ module: "thumbnail" });

export const LOCAL_THUMB_UPDATED_EVENT = "excalidraw-local-thumb-updated";

const PREFIX = "excalidraw-web-local-thumb-";
const META_PREFIX = "excalidraw-web-local-thumb-meta-";

/** ~150KB max per SVG string in sessionStorage */
const MAX_CHARS = 150_000;

export type LocalThumbnailMeta = {
  contentSha?: string | null;
  /** Draft preview fingerprint; must match FileSyncState draft hash to display. */
  sceneHash?: string | null;
};

function looksLikeCompleteSvg(value: string): boolean {
  return value.includes("<svg") && value.includes("</svg>");
}

function readMeta(fileId: string): LocalThumbnailMeta {
  try {
    const raw = sessionStorage.getItem(LocalThumbnailCache.metaKey(fileId));
    if (!raw) {
      return {};
    }
    return JSON.parse(raw) as LocalThumbnailMeta;
  } catch {
    return {};
  }
}

function writeMeta(fileId: string, meta: LocalThumbnailMeta): void {
  try {
    sessionStorage.setItem(
      LocalThumbnailCache.metaKey(fileId),
      JSON.stringify(meta),
    );
  } catch {
    // quota / private mode
  }
}

export const LocalThumbnailCache = {
  key(fileId: string): string {
    return `${PREFIX}${fileId}`;
  },

  metaKey(fileId: string): string {
    return `${META_PREFIX}${fileId}`;
  },

  set(
    fileId: string,
    svg: string | undefined,
    opts?: Partial<LocalThumbnailMeta>,
  ): void {
    if (!svg) {
      logThumb.debug(`localThumb set skip ${fileId.slice(0, 8)}: empty`);
      return;
    }
    if (svg.length > MAX_CHARS) {
      try {
        sessionStorage.removeItem(this.key(fileId));
        sessionStorage.removeItem(this.metaKey(fileId));
      } catch {
        // ignore
      }
      logThumb.debug(
        `localThumb set skip ${fileId.slice(0, 8)}: oversize len=${
          svg.length
        } limit=${MAX_CHARS}`,
      );
      return;
    }
    try {
      sessionStorage.setItem(this.key(fileId), svg);
      if (opts) {
        const next = { ...readMeta(fileId) };
        if ("contentSha" in opts) {
          next.contentSha = opts.contentSha ?? null;
          if (opts.contentSha) {
            next.sceneHash = null;
          }
        }
        if ("sceneHash" in opts) {
          next.sceneHash = opts.sceneHash ?? null;
          if (opts.sceneHash) {
            next.contentSha = null;
          }
        }
        writeMeta(fileId, next);
      }
      logThumb.debug(
        `localThumb set ${fileId.slice(0, 8)} len=${
          svg.length
        } truncated=false`,
      );
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(LOCAL_THUMB_UPDATED_EVENT, {
            detail: { fileId },
          }),
        );
      }
    } catch {
      logThumb.debug(`localThumb set FAILED ${fileId.slice(0, 8)}`);
      // quota / private mode
    }
  },

  get(fileId: string): string | null {
    try {
      const value = sessionStorage.getItem(this.key(fileId));
      if (value && !looksLikeCompleteSvg(value)) {
        sessionStorage.removeItem(this.key(fileId));
        logThumb.debug(
          `localThumb get ${fileId.slice(0, 8)} invalid=true len=${
            value.length
          }`,
        );
        return null;
      }
      logThumb.debug(
        `localThumb get ${fileId.slice(0, 8)} hit=${!!value} len=${
          value?.length ?? 0
        }`,
      );
      return value;
    } catch {
      logThumb.debug(`localThumb get FAILED ${fileId.slice(0, 8)}`);
      return null;
    }
  },

  getBoundContentSha(fileId: string): string | null {
    return readMeta(fileId).contentSha ?? null;
  },

  getBoundSceneHash(fileId: string): string | null {
    return readMeta(fileId).sceneHash ?? null;
  },

  /** Draft / local-draft cards: only show preview matching current draft hash. */
  getForDraft(
    fileId: string,
    draftHash: string | null | undefined,
  ): string | null {
    if (!draftHash) {
      return null;
    }
    const boundSceneHash = this.getBoundSceneHash(fileId);
    if (!boundSceneHash || boundSceneHash !== draftHash) {
      return null;
    }
    return this.get(fileId);
  },

  getForContent(
    fileId: string,
    contentSha: string | null | undefined,
  ): string | null {
    if (!contentSha) {
      return null;
    }
    const boundSha = this.getBoundContentSha(fileId);
    if (!boundSha || boundSha !== contentSha) {
      return null;
    }
    return this.get(fileId);
  },

  /** Unified lookup for file-list cards (draft slot vs synced contentSha). */
  getForFileListSlot(
    fileId: string,
    opts: {
      preferLocalThumb: boolean;
      draftHash?: string | null;
      contentSha?: string | null;
    },
  ): string | null {
    return opts.preferLocalThumb
      ? this.getForDraft(fileId, opts.draftHash)
      : this.getForContent(fileId, opts.contentSha);
  },

  /** Cache a draft-session preview; clears synced contentSha binding. */
  setDraftPreview(
    fileId: string,
    svg: string,
    sceneHash: string | null | undefined,
  ): void {
    this.set(fileId, svg, { sceneHash: sceneHash ?? null, contentSha: null });
  },

  /** After save, bind session thumb to server contentSha so synced cards can use it. */
  bindToContentSha(
    fileId: string,
    contentSha: string | null | undefined,
    svg?: string | null,
  ): string | null {
    if (!contentSha) {
      return null;
    }
    const resolved =
      (typeof svg === "string" && svg.length > 0 ? svg : null) ??
      this.get(fileId);
    if (!resolved) {
      return null;
    }
    this.set(fileId, resolved, { contentSha, sceneHash: null });
    return resolved;
  },

  clear(fileId: string): void {
    try {
      sessionStorage.removeItem(this.key(fileId));
      sessionStorage.removeItem(this.metaKey(fileId));
      logThumb.debug(`localThumb clear ${fileId.slice(0, 8)}`);
    } catch {
      logThumb.debug(`localThumb clear FAILED ${fileId.slice(0, 8)}`);
      // ignore
    }
  },
};
