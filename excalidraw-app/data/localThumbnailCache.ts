/**
 * Client-side SVG preview for the file list（与会话绑定，见 forkFileTypes 总览）。
 * 可与服务器 thumbnail_svg 组合显示导入/未保存预览。
 */

import { debugLog } from "./debugLog";

const PREFIX = "excalidraw-web-local-thumb-";

/** ~150KB max per SVG string in sessionStorage */
const MAX_CHARS = 150_000;

function looksLikeCompleteSvg(value: string): boolean {
  return value.includes("<svg") && value.includes("</svg>");
}

export const LocalThumbnailCache = {
  key(fileId: string): string {
    return `${PREFIX}${fileId}`;
  },

  set(fileId: string, svg: string | undefined): void {
    if (!svg) {
      debugLog.thumbnail(`localThumb set skip ${fileId.slice(0, 8)}: empty`);
      return;
    }
    if (svg.length > MAX_CHARS) {
      try {
        sessionStorage.removeItem(this.key(fileId));
      } catch {
        // ignore
      }
      debugLog.thumbnail(
        `localThumb set skip ${fileId.slice(0, 8)}: oversize len=${svg.length} limit=${MAX_CHARS}`,
      );
      return;
    }
    try {
      sessionStorage.setItem(this.key(fileId), svg);
      debugLog.thumbnail(
        `localThumb set ${fileId.slice(0, 8)} len=${svg.length} truncated=false`,
      );
    } catch {
      debugLog.thumbnail(`localThumb set FAILED ${fileId.slice(0, 8)}`);
      // quota / private mode
    }
  },

  get(fileId: string): string | null {
    try {
      const value = sessionStorage.getItem(this.key(fileId));
      if (value && !looksLikeCompleteSvg(value)) {
        sessionStorage.removeItem(this.key(fileId));
        debugLog.thumbnail(
          `localThumb get ${fileId.slice(0, 8)} invalid=true len=${value.length}`,
        );
        return null;
      }
      debugLog.thumbnail(
        `localThumb get ${fileId.slice(0, 8)} hit=${!!value} len=${value?.length ?? 0}`,
      );
      return value;
    } catch {
      debugLog.thumbnail(`localThumb get FAILED ${fileId.slice(0, 8)}`);
      return null;
    }
  },

  clear(fileId: string): void {
    try {
      sessionStorage.removeItem(this.key(fileId));
      debugLog.thumbnail(`localThumb clear ${fileId.slice(0, 8)}`);
    } catch {
      debugLog.thumbnail(`localThumb clear FAILED ${fileId.slice(0, 8)}`);
      // ignore
    }
  },
};
