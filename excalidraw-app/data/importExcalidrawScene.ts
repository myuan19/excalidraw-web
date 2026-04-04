import type { BinaryFiles } from "@excalidraw/excalidraw/types";

import type { ForkSceneSnapshot } from "./forkFileTypes";

/**
 * Parse a local file into server-storable scene data.
 *
 * Heavy dependencies (`loadFromBlob`, `cleanAppStateForExport`) are loaded
 * on-demand so they don't end up in the initial bundle — this function is only
 * invoked when the user explicitly imports a file.
 */
export async function loadExcalidrawFileAsServerSceneData(
  file: File,
): Promise<ForkSceneSnapshot & { elements: unknown[]; files: BinaryFiles }> {
  const [{ loadFromBlob }, { cleanAppStateForExport }] = await Promise.all([
    import("@excalidraw/excalidraw/data/blob"),
    import("@excalidraw/excalidraw/appState"),
  ]);

  const data = await loadFromBlob(file, null, null);
  const cleaned = cleanAppStateForExport(data.appState as any);
  return {
    elements: data.elements as unknown[],
    appState: cleaned as unknown,
    files: data.files ?? {},
  };
}

export function formatImportErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) {
    return "导入失败，请检查文件是否为 Excalidraw 场景";
  }
  if (err.message === "Error: invalid file") {
    return "不是有效的 Excalidraw 场景文件（.excalidraw / JSON 等）";
  }
  return err.message;
}
