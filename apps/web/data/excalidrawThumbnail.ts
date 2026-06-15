import { createLogger } from "../lib/logger";
import { LocalThumbnailCache } from "./localThumbnailCache";
import { buildSceneThumbnailSvg } from "./thumbnailSvg";

const logThumb = createLogger({ module: "thumbnail" });

export type ExcalidrawThumbnailScene = {
  elements: unknown;
  appState: unknown;
  files: unknown;
};

/** 空闲时再生成缩略图，避免与首屏渲染争抢字体 subset worker。 */
export function scheduleExcalidrawThumbnailAndCache(
  fileId: string,
  scene: ExcalidrawThumbnailScene,
): void {
  const run = () => {
    void generateExcalidrawThumbnailAndCache(fileId, scene);
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 4000 });
  } else {
    window.setTimeout(run, 200);
  }
}

/** 生成 Excalidraw 列表缩略图并写入 sessionStorage；失败时返回 undefined。 */
export async function generateExcalidrawThumbnailAndCache(
  fileId: string,
  scene: ExcalidrawThumbnailScene,
): Promise<string | undefined> {
  try {
    const thumbnail = await buildSceneThumbnailSvg(scene);
    LocalThumbnailCache.set(fileId, thumbnail);
    logThumb.debug(
      `generateExcalidrawThumb ${fileId.slice(0, 8)}, svgLen=${thumbnail.length}`,
    );
    return thumbnail;
  } catch (err) {
    logThumb.debug(
      `generateExcalidrawThumb ${fileId.slice(0, 8)} FAILED`,
      err,
    );
    return undefined;
  }
}
