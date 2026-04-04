/**
 * Client-side SVG preview for the file list（与会话绑定，见 forkFileTypes 总览）。
 * 可与服务器 thumbnail_svg 组合显示导入/未保存预览。
 */

const PREFIX = "excalidraw-web-local-thumb-";

/** ~150KB max per SVG string in sessionStorage */
const MAX_CHARS = 150_000;

export const LocalThumbnailCache = {
  key(fileId: string): string {
    return `${PREFIX}${fileId}`;
  },

  set(fileId: string, svg: string | undefined): void {
    if (!svg) {
      return;
    }
    const payload = svg.length > MAX_CHARS ? svg.slice(0, MAX_CHARS) : svg;
    try {
      sessionStorage.setItem(this.key(fileId), payload);
    } catch {
      // quota / private mode
    }
  },

  get(fileId: string): string | null {
    try {
      return sessionStorage.getItem(this.key(fileId));
    } catch {
      return null;
    }
  },

  clear(fileId: string): void {
    try {
      sessionStorage.removeItem(this.key(fileId));
    } catch {
      // ignore
    }
  },
};
