import {
  FILE_LIST_THUMB_DISPLAY_ASPECT,
  FILE_LIST_THUMB_EXPORT_PADDING,
  appStateForThumbnailExport,
} from "./thumbnailExport";

/** Remove broken embedded fonts from exported SVG thumbnails. */
export function sanitizeThumbnailSvg(svgMarkup: string): string {
  return svgMarkup
    .replace(/<style\b[^>]*class="style-fonts"[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?@font-face[\s\S]*?<\/style>/gi, "");
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function viewBackgroundFromSceneAppState(appState: unknown): string {
  if (!appState || typeof appState !== "object") {
    return "#ffffff";
  }
  const c = (appState as Record<string, unknown>).viewBackgroundColor;
  if (typeof c === "string" && c.trim()) {
    return c.trim();
  }
  return "#ffffff";
}

/**
 * 将 viewBox 扩成目标宽高比，并在最底层铺一层与画布一致的底色，避免 `meet` 时两侧/上下露出卡片灰底。
 */
export function expandThumbnailSvgToDisplayAspect(
  svgMarkup: string,
  targetAspect: number,
  background: string,
): string {
  if (!Number.isFinite(targetAspect) || targetAspect <= 0) {
    return svgMarkup;
  }
  const vbMatch = svgMarkup.match(/viewBox\s*=\s*"([^"]+)"/i);
  if (!vbMatch) {
    return svgMarkup;
  }
  const parts = vbMatch[1].trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length !== 4) {
    return svgMarkup;
  }
  const minX = Number(parts[0]);
  const minY = Number(parts[1]);
  const w = Number(parts[2]);
  const h = Number(parts[3]);
  if (
    ![minX, minY, w, h].every((n) => Number.isFinite(n)) ||
    w <= 0 ||
    h <= 0
  ) {
    return svgMarkup;
  }
  const curAspect = w / h;
  if (Math.abs(curAspect - targetAspect) <= 1e-6) {
    return svgMarkup;
  }

  let nx = minX;
  let ny = minY;
  let nw = w;
  let nh = h;
  if (curAspect < targetAspect) {
    nw = h * targetAspect;
    nx = minX - (nw - w) / 2;
  } else {
    nh = w / targetAspect;
    ny = minY - (nh - h) / 2;
  }

  const escapedBg = escapeXmlAttr(background);
  const newVb = `${nx} ${ny} ${nw} ${nh}`;
  let out = svgMarkup.replace(
    /viewBox\s*=\s*"[^"]*"/i,
    `viewBox="${newVb}"`,
  );
  const openMatch = out.match(/<svg\b[^>]*>/i);
  if (!openMatch || openMatch.index === undefined) {
    return out;
  }
  const endOpen = openMatch.index + openMatch[0].length;
  const rect = `<rect x="${nx}" y="${ny}" width="${nw}" height="${nh}" fill="${escapedBg}"/>`;
  return out.slice(0, endOpen) + rect + out.slice(endOpen);
}

export async function buildSceneThumbnailSvg(scene: {
  elements: unknown;
  appState: unknown;
  files: unknown;
}): Promise<string> {
  const { exportToSvg } = await import("@excalidraw/excalidraw");
  const svg = await exportToSvg({
    elements: scene.elements as any,
    appState: appStateForThumbnailExport(scene.appState as any),
    files: scene.files as any,
    exportPadding: FILE_LIST_THUMB_EXPORT_PADDING,
  });
  const bg = viewBackgroundFromSceneAppState(scene.appState);
  let html = sanitizeThumbnailSvg(svg.outerHTML);
  if (!/\bdata-excal-filelist-thumb\s*=/i.test(html)) {
    html = html.replace(
      /<svg\b/i,
      `<svg data-excal-filelist-thumb="1" data-excal-thumb-bg="${escapeXmlAttr(bg)}" `,
    );
  }
  return html;
}

/**
 * 从缩略图 SVG 标记中提取画布背景色（用于卡片容器 background-color）。
 */
export function extractThumbBg(svgMarkup: string): string {
  return (
    svgMarkup.match(/\bdata-excal-thumb-bg="([^"]*)"/i)?.[1] ?? "#ffffff"
  );
}

/**
 * 列表卡片内：保持 SVG 原始宽高比，以 xMidYMid meet 居中显示在 5/3 预览区内。
 * 留白区域由父容器背景色（与画布底色一致，见 extractThumbBg）填充，确保四周留白均等。
 * 父级 `overflow: hidden` + 圆角负责裁切。
 */
export function patchThumbnailSvgForCard(svgMarkup: string): string {
  const withoutEmbeddedFonts = sanitizeThumbnailSvg(svgMarkup);
  return withoutEmbeddedFonts.replace(
    /(<svg\b)((?:\s+[a-z][a-z0-9-]*(?:="[^"]*")?)*?)(\s*>)/i,
    (_match, open: string, attrs: string, close: string) => {
      const cleaned = attrs
        .replace(/\s+preserveAspectRatio="[^"]*"/i, "")
        .replace(/\s+width="[^"]*"/i, "")
        .replace(/\s+height="[^"]*"/i, "");
      return `${open}${cleaned} preserveAspectRatio="xMidYMid meet" width="100%" height="100%"${close}`;
    },
  );
}
