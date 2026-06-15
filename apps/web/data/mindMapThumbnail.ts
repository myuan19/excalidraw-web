import { createLogger } from "../lib/logger";
import { LocalThumbnailCache } from "./localThumbnailCache";
import { buildMindMapThumbnailSvg } from "./thumbnailSvg";

import type { MindMapDocumentData } from "./formats/MindMapAdapter";

const logThumb = createLogger({ module: "thumbnail" });

/** Schematic MindMap list thumbnail (create/import before native render). */
export async function generateMindMapThumbnailAndCache(
  fileId: string,
  data: MindMapDocumentData,
): Promise<string | undefined> {
  try {
    const thumbnail = await buildMindMapThumbnailSvg(data);
    LocalThumbnailCache.set(fileId, thumbnail);
    logThumb.debug(
      `generateMindMapThumb ${fileId.slice(0, 8)}, svgLen=${thumbnail.length}`,
    );
    return thumbnail;
  } catch (err) {
    logThumb.debug(
      `generateMindMapThumb ${fileId.slice(0, 8)} FAILED`,
      err,
    );
    return undefined;
  }
}
