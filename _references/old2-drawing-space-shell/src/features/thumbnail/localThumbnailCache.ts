const PREFIX = "drawing-space-local-thumb-";
const MAX_CHARS = 150_000;

function looksLikeSvg(value: string): boolean {
  return value.includes("<svg") && value.includes("</svg>");
}

export const LocalThumbnailCache = {
  key(fileId: string) {
    return `${PREFIX}${fileId}`;
  },

  set(fileId: string, svg?: string | null) {
    if (!svg || svg.length > MAX_CHARS || !looksLikeSvg(svg)) return;
    try {
      sessionStorage.setItem(this.key(fileId), svg);
    } catch {
      // Session cache is only a draft preview optimization.
    }
  },

  get(fileId: string): string | null {
    try {
      const svg = sessionStorage.getItem(this.key(fileId));
      if (svg && looksLikeSvg(svg)) return svg;
      if (svg) sessionStorage.removeItem(this.key(fileId));
    } catch {
      // ignore
    }
    return null;
  },

  clear(fileId: string) {
    try {
      sessionStorage.removeItem(this.key(fileId));
    } catch {
      // ignore
    }
  },
};
