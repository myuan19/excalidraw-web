import { createLogger } from "../lib/logger";

import {
  buildExcalidrawSceneThumbnailSvg,
  cancelScheduledExcalidrawSceneThumbnailGeneration,
  resolveExcalidrawSceneForThumbnail,
  scheduleExcalidrawSceneThumbnailGeneration,
} from "./excalidrawSceneThumbnail";
import { cacheDraftFileThumbnail } from "./sessionFileThumbnail";
import { isVisibleThumbnail } from "./thumbnailService";
import {
  sanitizeThumbnailSvg,
  viewBackgroundFromSceneAppState,
  withFileListThumbnailAttrs,
} from "./thumbnailSvg";

const logThumb = createLogger({ module: "thumbnail" });

import type { ExcalidrawThumbnailScene } from "./excalidrawSceneThumbnail";

export type { ExcalidrawThumbnailScene };

function finalizeExcalidrawThumbnailSvg(
  scene: ExcalidrawThumbnailScene,
  rawSvg: string,
): string {
  const bg = viewBackgroundFromSceneAppState(scene.appState);
  return withFileListThumbnailAttrs(sanitizeThumbnailSvg(rawSvg), bg);
}

async function cacheExcalidrawSceneThumbnail(
  fileId: string,
  scene: ExcalidrawThumbnailScene,
  sceneHash: string,
): Promise<string | undefined> {
  try {
    const rawSvg = await buildExcalidrawSceneThumbnailSvg(scene);
    const thumbnailSvg = finalizeExcalidrawThumbnailSvg(scene, rawSvg);
    if (!isVisibleThumbnail(thumbnailSvg)) {
      return undefined;
    }
    cacheDraftFileThumbnail(fileId, thumbnailSvg, sceneHash);
    logThumb.debug(
      `generateExcalidrawThumb ${fileId.slice(0, 8)}, svgLen=${
        thumbnailSvg.length
      }`,
    );
    return thumbnailSvg;
  } catch (err) {
    logThumb.debug(`generateExcalidrawThumb ${fileId.slice(0, 8)} FAILED`, err);
    return undefined;
  }
}

/** Draft edits: debounced native export, same fidelity model as MindMap iframe export. */
export function scheduleExcalidrawThumbnailAndCache(
  fileId: string,
  scene: ExcalidrawThumbnailScene,
): void {
  scheduleExcalidrawSceneThumbnailGeneration(fileId, scene, ({ scene, sceneHash }) => {
    void cacheExcalidrawSceneThumbnail(fileId, scene, sceneHash);
  });
}

/** 生成 Excalidraw 列表缩略图并写入 sessionStorage；失败时返回 undefined。 */
export async function generateExcalidrawThumbnailAndCache(
  fileId: string,
  scene: ExcalidrawThumbnailScene,
): Promise<string | undefined> {
  cancelScheduledExcalidrawSceneThumbnailGeneration(fileId);
  const { scene: canonicalScene, sceneHash } = resolveExcalidrawSceneForThumbnail(
    fileId,
    scene,
  );
  return cacheExcalidrawSceneThumbnail(fileId, canonicalScene, sceneHash);
}
