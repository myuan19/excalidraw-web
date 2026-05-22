import { exportToSvg } from "@excalidraw/excalidraw";
import { createPlaceholderThumbnailSvg } from "@/features/thumbnail";
import { appStateForThumbnailExport } from "@/features/thumbnail/thumbnailExport";
import { normalizeExcalidrawScene } from "@/editors/excalidraw/save";

export async function createImportThumbnail(
  kind: string,
  title: string,
  document: unknown,
): Promise<string> {
  if (kind !== "excalidraw") {
    return createPlaceholderThumbnailSvg({ title, kind });
  }
  try {
    const scene = normalizeExcalidrawScene(document);
    if (!scene.elements.length) {
      return createPlaceholderThumbnailSvg({ title, kind });
    }
    const svg = await exportToSvg({
      elements: scene.elements as never,
      appState: appStateForThumbnailExport(scene.appState) as never,
      files: scene.files as never,
    });
    return svg.outerHTML;
  } catch {
    return createPlaceholderThumbnailSvg({ title, kind });
  }
}
