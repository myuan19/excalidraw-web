import { createLogger } from "../lib/logger";
import { generateMindMapThumbnailAndCache as generateNativeMindMapThumbnailAndCache } from "../editors/mindmap/mindMapNativeThumbnailRenderer";

import type { MindMapDocumentData } from "./formats/MindMapAdapter";

const logThumb = createLogger({ module: "thumbnail" });

/** Native simple-mind-map thumbnail export for list cards and imports. */
export async function generateMindMapThumbnailAndCache(
  fileId: string,
  data: MindMapDocumentData,
): Promise<string | undefined> {
  const fileId8 = fileId.slice(0, 8);
  try {
    const thumbnail = await generateNativeMindMapThumbnailAndCache(
      fileId,
      data,
    );
    if (!thumbnail) {
      logThumb.event("warn", "generateMindMapThumb FAILED", fileId8, {
        fields: { fileId8, svgLen: 0 },
      });
      return undefined;
    }
    logThumb.debug(`generateMindMapThumb ${fileId8}, svgLen=${thumbnail.length}`);
    return thumbnail;
  } catch (err) {
    logThumb.event("warn", "generateMindMapThumb FAILED", fileId8, {
      fields: { fileId8, error: String(err) },
    });
    return undefined;
  }
}
