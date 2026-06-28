import { createLogger } from "../lib/logger";
import { isDebugRuntimeEnabled } from "./debugCapability";
import { traceIssueDiag } from "../lib/issueDiagTrace";

import {
  buildExcalidrawSceneThumbnailSvg,
  cancelScheduledExcalidrawSceneThumbnailGeneration,
  resolveExcalidrawSceneForThumbnail,
  scheduleExcalidrawSceneThumbnailGeneration,
  type ExcalidrawThumbnailScene,
} from "./excalidrawSceneThumbnail";
import { cacheDraftThumbnailIfVisible } from "./thumbnailLifecycle";
import {
  sanitizeThumbnailSvg,
  viewBackgroundFromSceneAppState,
  withFileListThumbnailAttrs,
} from "./thumbnailSvg";

const logThumb = createLogger({ module: "thumbnail" });

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
  const totalStartedAt = performance.now();
  try {
    const buildStartedAt = performance.now();
    const rawSvg = await buildExcalidrawSceneThumbnailSvg(scene);
    const buildSvgMs = Math.round(performance.now() - buildStartedAt);
    const finalizeStartedAt = performance.now();
    const thumbnailSvg = finalizeExcalidrawThumbnailSvg(scene, rawSvg);
    const finalizeMs = Math.round(performance.now() - finalizeStartedAt);
    const cacheStartedAt = performance.now();
    const cached = cacheDraftThumbnailIfVisible(
      fileId,
      "excalidraw",
      thumbnailSvg,
      sceneHash,
    );
    const cacheMs = Math.round(performance.now() - cacheStartedAt);
    if (isDebugRuntimeEnabled()) {
      traceIssueDiag(
        "excalidraw.drag",
        "thumbnail.generate",
        {
          fileId8: fileId.slice(0, 8),
          sceneHash8: sceneHash.slice(0, 8),
          svgLen: thumbnailSvg.length,
          buildSvgMs,
          finalizeMs,
          cacheMs,
          totalMs: Math.round(performance.now() - totalStartedAt),
        },
        buildSvgMs > 16 || cacheMs > 16 ? "fail" : "ok",
      );
    }
    if (!cached) {
      return undefined;
    }
    logThumb.debug(
      `generateExcalidrawThumb ${fileId.slice(0, 8)}, svgLen=${
        thumbnailSvg.length
      }`,
    );
    return cached;
  } catch (err) {
    if (isDebugRuntimeEnabled()) {
      traceIssueDiag(
        "excalidraw.drag",
        "thumbnail.generate",
        {
          fileId8: fileId.slice(0, 8),
          sceneHash8: sceneHash.slice(0, 8),
          totalMs: Math.round(performance.now() - totalStartedAt),
          error: err instanceof Error ? err.message : String(err),
        },
        "fail",
      );
    }
    logThumb.debug(`generateExcalidrawThumb ${fileId.slice(0, 8)} FAILED`, err);
    return undefined;
  }
}

/** Draft edits: debounced native export, aligned with MindMap iframe export. */
export function scheduleExcalidrawThumbnailAndCache(
  fileId: string,
  scene: ExcalidrawThumbnailScene,
): void {
  if (isDebugRuntimeEnabled()) {
    traceIssueDiag(
      "excalidraw.drag",
      "thumbnail.schedule",
      {
        fileId8: fileId.slice(0, 8),
        elements: Array.isArray(scene.elements) ? scene.elements.length : null,
        files:
          scene.files && typeof scene.files === "object"
            ? Object.keys(scene.files).length
            : null,
      },
      "branch",
    );
  }
  scheduleExcalidrawSceneThumbnailGeneration(
    fileId,
    scene,
    ({ scene, sceneHash }) => {
      void cacheExcalidrawSceneThumbnail(fileId, scene, sceneHash);
    },
  );
}

/** 生成 Excalidraw 列表缩略图并写入 sessionStorage；失败时返回 undefined。 */
export async function generateExcalidrawThumbnailAndCache(
  fileId: string,
  scene: ExcalidrawThumbnailScene,
): Promise<string | undefined> {
  cancelScheduledExcalidrawSceneThumbnailGeneration(fileId);
  const { scene: canonicalScene, sceneHash } =
    resolveExcalidrawSceneForThumbnail(fileId, scene);
  return cacheExcalidrawSceneThumbnail(fileId, canonicalScene, sceneHash);
}
