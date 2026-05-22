import { THUMBNAIL_SVG_COLORS } from "./thumbnailTheme";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function createPlaceholderThumbnailSvg(opts: {
  title: string;
  kind: string;
  width?: number;
  height?: number;
}): string {
  const width = opts.width ?? 640;
  const height = opts.height ?? 384;
  const isMindMap = opts.kind === "mindmap";
  const accent = isMindMap ? THUMBNAIL_SVG_COLORS.mindmapAccent : THUMBNAIL_SVG_COLORS.excalidrawAccent;
  const icon = isMindMap ? "M160 192h96v48h-96zM384 96h96v48h-96zM384 240h96v48h-96zM256 216h64v-96h64" : "M160 260 370 110l110 154-70 50-60-84-150 107z";
  const c = THUMBNAIL_SVG_COLORS;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="28" fill="${c.canvas}"/>
  <rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="22" fill="${c.card}" stroke="${c.border}" stroke-width="2"/>
  <path d="${icon}" fill="none" stroke="${accent}" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="40" y="${height - 44}" font-family="Inter, system-ui, sans-serif" font-size="28" font-weight="600" fill="${c.label}">${escapeXml(opts.title).slice(0, 36)}</text>
</svg>`;
}

export function svgToObjectUrl(svg: string): string {
  return URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
}
