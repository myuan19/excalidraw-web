/**
 * Session-scoped thumbnail cache with two explicit slots:
 *
 * - **draft**：编辑中实时预览（sceneHash 绑定），供编辑器 session / local-draft 列表。
 * - **saved**：上次保存到服务器的快照（contentSha 绑定），供未保存服务器文件列表卡片。
 */

import { createLogger } from "../lib/logger";
import {
  decodeMindMapThumbnailPayload,
  isNativeMindMapThumbnailSvg,
  normalizeMindMapThumbnailSvg,
} from "./thumbnailSvg";

const logThumb = createLogger({ module: "thumbnail" });

export const LOCAL_THUMB_UPDATED_EVENT = "excalidraw-local-thumb-updated";

const DRAFT_KEY_PREFIX = "excalidraw-web-local-thumb-draft-";
const SAVED_KEY_PREFIX = "excalidraw-web-local-thumb-saved-";
const DRAFT_META_PREFIX = "excalidraw-web-local-thumb-draft-meta-";
const SAVED_META_PREFIX = "excalidraw-web-local-thumb-saved-meta-";

/** Legacy single-key layout (read-only migration). */
const LEGACY_KEY_PREFIX = "excalidraw-web-local-thumb-";
const LEGACY_META_PREFIX = "excalidraw-web-local-thumb-meta-";

/** ~150KB max per SVG string in sessionStorage */
const MAX_CHARS = 150_000;

type DraftMeta = { sceneHash?: string | null };
type SavedMeta = { contentSha?: string | null };

function looksLikeCompleteSvg(value: string): boolean {
  return value.includes("<svg") && value.includes("</svg>");
}

function readDraftMeta(fileId: string): DraftMeta {
  try {
    const raw = sessionStorage.getItem(LocalThumbnailCache.draftMetaKey(fileId));
    return raw ? (JSON.parse(raw) as DraftMeta) : {};
  } catch {
    return {};
  }
}

function writeDraftMeta(fileId: string, meta: DraftMeta): void {
  try {
    sessionStorage.setItem(
      LocalThumbnailCache.draftMetaKey(fileId),
      JSON.stringify(meta),
    );
  } catch {
    /* quota / private mode */
  }
}

function readSavedMeta(fileId: string): SavedMeta {
  try {
    const raw = sessionStorage.getItem(LocalThumbnailCache.savedMetaKey(fileId));
    return raw ? (JSON.parse(raw) as SavedMeta) : {};
  } catch {
    return {};
  }
}

function writeSavedMeta(fileId: string, meta: SavedMeta): void {
  try {
    sessionStorage.setItem(
      LocalThumbnailCache.savedMetaKey(fileId),
      JSON.stringify(meta),
    );
  } catch {
    /* quota / private mode */
  }
}

function normalizeSvgForCache(svg: string): string {
  let resolved = svg;
  if (/^data:image\/svg\+xml/i.test(svg.trim())) {
    resolved =
      decodeMindMapThumbnailPayload(svg) ??
      normalizeMindMapThumbnailSvg(svg, { source: "native" });
  } else if (svg.includes("smm-container")) {
    resolved = normalizeMindMapThumbnailSvg(
      svg,
      isNativeMindMapThumbnailSvg(svg) ? { source: "native" } : undefined,
    );
  }
  return resolved;
}

function writeSvgToKey(
  key: string,
  svg: string,
  fileId8: string,
): string | null {
  const resolved = normalizeSvgForCache(svg);
  if (resolved.length > MAX_CHARS) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    logThumb.debug(
      `localThumb set skip ${fileId8}: oversize len=${svg.length} limit=${MAX_CHARS}`,
    );
    return null;
  }
  try {
    sessionStorage.setItem(key, resolved);
    return resolved;
  } catch {
    logThumb.debug(`localThumb set FAILED ${fileId8}`);
    return null;
  }
}

function readSvgFromKey(key: string, fileId8: string): string | null {
  try {
    const value = sessionStorage.getItem(key);
    if (!value) {
      return null;
    }
    if (!looksLikeCompleteSvg(value)) {
      sessionStorage.removeItem(key);
      return null;
    }
    if (
      (value.includes("smm-container") ||
        /^data:image\/svg\+xml/i.test(value.trim())) &&
      !value.includes('data-excal-mindmap-thumb-normalized="1"')
    ) {
      const normalized = normalizeSvgForCache(value);
      sessionStorage.setItem(key, normalized);
      return normalized;
    }
    return value;
  } catch {
    logThumb.debug(`localThumb get FAILED ${fileId8}`);
    return null;
  }
}

function migrateLegacyDraftIfNeeded(fileId: string): void {
  try {
    const legacySvg = sessionStorage.getItem(`${LEGACY_KEY_PREFIX}${fileId}`);
    if (!legacySvg || !looksLikeCompleteSvg(legacySvg)) {
      return;
    }
    const draftKey = LocalThumbnailCache.draftKey(fileId);
    if (sessionStorage.getItem(draftKey)) {
      return;
    }
    sessionStorage.setItem(draftKey, legacySvg);
    const legacyMetaRaw = sessionStorage.getItem(
      `${LEGACY_META_PREFIX}${fileId}`,
    );
    if (legacyMetaRaw) {
      sessionStorage.setItem(
        LocalThumbnailCache.draftMetaKey(fileId),
        legacyMetaRaw,
      );
    }
  } catch {
    /* ignore */
  }
}

function emitThumbUpdated(fileId: string): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(LOCAL_THUMB_UPDATED_EVENT, { detail: { fileId } }),
    );
  }
}

export const LocalThumbnailCache = {
  draftKey(fileId: string): string {
    return `${DRAFT_KEY_PREFIX}${fileId}`;
  },

  savedKey(fileId: string): string {
    return `${SAVED_KEY_PREFIX}${fileId}`;
  },

  draftMetaKey(fileId: string): string {
    return `${DRAFT_META_PREFIX}${fileId}`;
  },

  savedMetaKey(fileId: string): string {
    return `${SAVED_META_PREFIX}${fileId}`;
  },

  /** @deprecated 使用 draftKey / savedKey */
  key(fileId: string): string {
    return this.draftKey(fileId);
  },

  /** @deprecated 使用 draftMetaKey / savedMetaKey */
  metaKey(fileId: string): string {
    return this.draftMetaKey(fileId);
  },

  set(
    fileId: string,
    svg: string | undefined,
    opts?: { contentSha?: string | null; sceneHash?: string | null },
  ): void {
    if (!svg) {
      logThumb.debug(`localThumb set skip ${fileId.slice(0, 8)}: empty`);
      return;
    }
    if (opts && "contentSha" in opts && opts.contentSha) {
      const written = writeSvgToKey(
        this.savedKey(fileId),
        svg,
        fileId.slice(0, 8),
      );
      if (!written) {
        return;
      }
      writeSavedMeta(fileId, { contentSha: opts.contentSha });
      logThumb.debug(`localThumb saved ${fileId.slice(0, 8)} len=${written.length}`);
      emitThumbUpdated(fileId);
      return;
    }
    const written = writeSvgToKey(this.draftKey(fileId), svg, fileId.slice(0, 8));
    if (!written) {
      return;
    }
    if (opts && "sceneHash" in opts) {
      writeDraftMeta(fileId, { sceneHash: opts.sceneHash ?? null });
    } else {
      sessionStorage.removeItem(this.draftMetaKey(fileId));
    }
    logThumb.debug(`localThumb draft ${fileId.slice(0, 8)} len=${written.length}`);
    emitThumbUpdated(fileId);
  },

  getBoundContentSha(fileId: string): string | null {
    return readSavedMeta(fileId).contentSha ?? null;
  },

  getBoundSceneHash(fileId: string): string | null {
    return readDraftMeta(fileId).sceneHash ?? null;
  },

  getDraftSvg(fileId: string): string | null {
    migrateLegacyDraftIfNeeded(fileId);
    return readSvgFromKey(this.draftKey(fileId), fileId.slice(0, 8));
  },

  getDraftPreview(
    fileId: string,
    draftHash: string | null | undefined,
  ): string | null {
    if (!draftHash) {
      return null;
    }
    const bound = this.getBoundSceneHash(fileId);
    if (!bound || bound !== draftHash) {
      return null;
    }
    return this.getDraftSvg(fileId);
  },

  getSavedContentThumb(
    fileId: string,
    contentSha: string | null | undefined,
  ): string | null {
    if (!contentSha) {
      return null;
    }
    const bound = this.getBoundContentSha(fileId);
    if (!bound || bound !== contentSha) {
      return null;
    }
    return readSvgFromKey(this.savedKey(fileId), fileId.slice(0, 8));
  },

  /** @deprecated 使用 getDraftSvg */
  get(fileId: string): string | null {
    return this.getDraftSvg(fileId);
  },

  /** @deprecated 使用 getSavedContentThumb */
  getForContent(
    fileId: string,
    contentSha: string | null | undefined,
  ): string | null {
    return this.getSavedContentThumb(fileId, contentSha);
  },

  /** @deprecated 使用 getDraftPreview */
  getForDraft(
    fileId: string,
    draftHash: string | null | undefined,
  ): string | null {
    return this.getDraftPreview(fileId, draftHash);
  },

  /** @deprecated 使用 buildThumbnailDraftSlot + resolveListCardLocalThumb */
  getForFileListSlot(
    fileId: string,
    opts: {
      preferLocalThumb: boolean;
      draftHash?: string | null;
      contentSha?: string | null;
    },
  ): string | null {
    return opts.preferLocalThumb
      ? this.getDraftPreview(fileId, opts.draftHash)
      : this.getSavedContentThumb(fileId, opts.contentSha);
  },

  setDraftPreview(
    fileId: string,
    svg: string,
    sceneHash: string | null | undefined,
  ): void {
    this.set(fileId, svg, { sceneHash: sceneHash ?? null });
  },

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
      this.getDraftSvg(fileId);
    if (!resolved) {
      return null;
    }
    this.set(fileId, resolved, { contentSha });
    return resolved;
  },

  clear(fileId: string): void {
    try {
      sessionStorage.removeItem(this.draftKey(fileId));
      sessionStorage.removeItem(this.draftMetaKey(fileId));
      sessionStorage.removeItem(this.savedKey(fileId));
      sessionStorage.removeItem(this.savedMetaKey(fileId));
      sessionStorage.removeItem(`${LEGACY_KEY_PREFIX}${fileId}`);
      sessionStorage.removeItem(`${LEGACY_META_PREFIX}${fileId}`);
      logThumb.debug(`localThumb clear ${fileId.slice(0, 8)}`);
    } catch {
      logThumb.debug(`localThumb clear FAILED ${fileId.slice(0, 8)}`);
    }
  },
};
