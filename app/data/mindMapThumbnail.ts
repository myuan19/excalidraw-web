import { createLogger } from "../lib/logger";
import { generateMindMapThumbnailAndCache as generateNativeMindMapThumbnailAndCache } from "../editors/mindmap/mindMapNativeThumbnailRenderer";

import type { MindMapDocumentData } from "./formats/MindMapAdapter";

const logThumb = createLogger({ module: "thumbnail" });

/** Native simple-mind-map thumbnail export for list cards and imports. */
export async function generateMindMapThumbnailAndCache(
  fileId: string,
  data: MindMapDocumentData,
): Promise<string | undefined> {
  try {
    const thumbnail = await generateNativeMindMapThumbnailAndCache(
      fileId,
      data,
    );
    logThumb.debug(
      `generateMindMapThumb ${fileId.slice(0, 8)}, svgLen=${
        thumbnail?.length ?? 0
      }`,
    );
    return thumbnail;
  } catch (err) {
    logThumb.debug(`generateMindMapThumb ${fileId.slice(0, 8)} FAILED`, err);
    return undefined;
  }
}
