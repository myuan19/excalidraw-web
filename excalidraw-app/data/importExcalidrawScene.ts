import { MIME_TYPES } from "@excalidraw/common";
import { ImageSceneDataError } from "@excalidraw/excalidraw/errors";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";

import type { ForkSceneSnapshot } from "./forkFileTypes";

/**
 * Parse a local file into server-storable scene data.
 *
 * Heavy dependencies are loaded on-demand so they don't end up in the initial
 * bundle — this function is only invoked when the user explicitly imports a file.
 */
export async function loadExcalidrawFileAsServerSceneData(
  file: File,
): Promise<ForkSceneSnapshot & { elements: unknown[]; files: BinaryFiles }> {
  const [{ loadSceneOrLibraryFromBlob }, { cleanAppStateForExport }] =
    await Promise.all([
      import("@excalidraw/excalidraw/data/blob"),
      import("@excalidraw/excalidraw/appState"),
    ]);

  const ret = await loadSceneOrLibraryFromBlob(file, null, null);
  if (ret.type === MIME_TYPES.excalidrawlib) {
    throw new Error(
      "该文件是素材库（.excalidrawlib），不是单页场景。请打开画布后在「素材库」中导入。",
    );
  }
  if (ret.type !== MIME_TYPES.excalidraw) {
    throw new Error(
      "该文件不是可导入的 Excalidraw 单页场景。请使用 .excalidraw、.json 场景、含元数据的 .png / .svg；素材库请用 .excalidrawlib 并在画布内「素材库」导入。",
    );
  }
  const data = ret.data;
  const cleaned = cleanAppStateForExport(data.appState as any);
  return {
    elements: data.elements as unknown[],
    appState: cleaned as unknown,
    files: data.files ?? {},
  };
}

export function formatImportErrorMessage(err: unknown): string {
  if (err instanceof ImageSceneDataError) {
    if (
      err.code === "IMAGE_NOT_CONTAINS_SCENE_DATA" ||
      /doesn't contain scene/i.test(String(err.message))
    ) {
      return "该图片或 SVG 中未找到 Excalidraw 场景数据。请使用导出时带场景嵌入的 PNG/SVG，或直接使用 .excalidraw、.json 场景文件。";
    }
    if (
      /cannot restore image|无法恢复|INVALID/i.test(String(err.message))
    ) {
      return "无法从该图片中解析出场景。请换用 .excalidraw / 已嵌入元数据的 .png 或 .svg，或 .json 场景文件。";
    }
    return "无法从该图片或文件中提取 Excalidraw 场景，请换用 .excalidraw、带嵌入数据的导出图或 .json 场景。";
  }
  if (!(err instanceof Error)) {
    return "导入失败，请检查文件是否为 Excalidraw 场景";
  }
  if (err.message === "Error: invalid file") {
    return "不是有效的 Excalidraw 场景文件，请使用 .excalidraw、含元数据的 .png / .svg 或导出的 .json 场景。";
  }
  const m = err.message;
  if (m.startsWith("API 404:") && m.includes("folder not found")) {
    return "目标文件夹在服务器上已不存在。请点击「全部文件」或刷新页面后，再选择文件夹并导入。";
  }
  if (m === "不支持的文件类型") {
    return "该文件不是可导入的 Excalidraw 单页场景。请使用 .excalidraw、.json、含元数据的 .png / .svg；素材库请在画布内「素材库」中导入 .excalidrawlib。";
  }
  if (
    /expected JSON but got|text\/html|Got HTML instead of JSON/i.test(m)
  ) {
    return "无法连接到文件 API：浏览器收到了网页而不是接口数据。请确认后端已启动（开发环境：./_scripts/run.sh dev）；Docker 请检查容器内 Node 与 /api 反代。";
  }
  return m;
}
