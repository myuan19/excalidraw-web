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

type LocalThumbnailMeta = {
  contentSha?: string | null;
};

function looksLikeCompleteSvg(value: string): boolean {
  return value.includes("<svg") && value.includes("</svg>");
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
    opts?: LocalThumbnailMeta,
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
      if (opts && "contentSha" in opts) {
        sessionStorage.setItem(
          this.metaKey(fileId),
          JSON.stringify({ contentSha: opts.contentSha ?? null }),
        );
      }
      // Omitting opts preserves existing contentSha meta so async draft
      // thumbnail updates do not invalidate synced file-list lookups.
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

  getForContent(
    fileId: string,
    contentSha: string | null | undefined,
  ): string | null {
    if (!contentSha) {
      return null;
    }
    try {
      const raw = sessionStorage.getItem(this.metaKey(fileId));
      if (!raw) {
        return null;
      }
      const meta = JSON.parse(raw) as LocalThumbnailMeta;
      if (meta.contentSha !== contentSha) {
        return null;
      }
      return this.get(fileId);
    } catch {
      return null;
    }
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
