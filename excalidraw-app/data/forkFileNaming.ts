/**
 * 保存到服务器时「显示文件名」的解析：画布标题优先，否则回退服务器当前名。
 */

import type { AppState } from "@excalidraw/excalidraw/types";

import { ServerSync } from "./ServerSync";

export async function resolveSaveDisplayName(
  fileId: string,
  appState: AppState | Record<string, unknown> | null | undefined,
): Promise<string> {
  const serverFile = await ServerSync.getFile(fileId);
  let canvasName = "";
  if (appState != null && typeof appState === "object") {
    const n = (appState as { name?: unknown }).name;
    if (typeof n === "string" && n.trim()) {
      canvasName = n.trim();
    }
  }
  return canvasName || serverFile.name;
}
