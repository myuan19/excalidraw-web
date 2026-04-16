import {
  FILE_LIST_THUMB_EXPORT_PADDING,
  appStateForThumbnailExport,
} from "./thumbnailExport";

/** Remove broken embedded fonts from exported SVG thumbnails. */
export function sanitizeThumbnailSvg(svgMarkup: string): string {
  return svgMarkup
    .replace(/<style\b[^>]*class="style-fonts"[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?@font-face[\s\S]*?<\/style>/gi, "");
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
  return sanitizeThumbnailSvg(svg.outerHTML);
}

/** Force SVG to fill & crop in the file card thumbnail area. */
export function patchThumbnailSvgForCard(svgMarkup: string): string {
  const withoutEmbeddedFonts = sanitizeThumbnailSvg(svgMarkup);
  return withoutEmbeddedFonts.replace(
    /(<svg\b)((?:\s+[a-z][a-z0-9-]*(?:="[^"]*")?)*?)(\s*>)/i,
    (_match, open: string, attrs: string, close: string) => {
      const cleaned = attrs
        .replace(/\s+preserveAspectRatio="[^"]*"/i, "")
        .replace(/\s+width="[^"]*"/i, "")
        .replace(/\s+height="[^"]*"/i, "");
      return `${open}${cleaned} preserveAspectRatio="xMidYMid slice" width="100%" height="100%"${close}`;
    },
  );
}
