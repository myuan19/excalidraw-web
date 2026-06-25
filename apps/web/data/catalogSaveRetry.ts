import { devDebug } from "../lib/devDebug";
import { isDesktopEditorHub } from "../lib/runtimePlatform";

import { ServerSync } from "./ServerSync";

/** Desktop 映射目录：403 file not imported */
export function isFileNotImportedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("403") && message.includes("file not imported");
}

/**
 * Desktop 保存失败且为 discovered 文件时，先 import 再重试一次。
 * Web 端无 import API，直接抛出原错误。
 */
export async function withCatalogImportRetry<T>(
  fileId: string,
  save: () => Promise<T>,
): Promise<T> {
  try {
    return await save();
  } catch (err) {
    if (!isDesktopEditorHub() || !isFileNotImportedError(err)) {
      throw err;
    }
    devDebug("api-sync", "[DEBUG] withCatalogImportRetry | import then retry", {
      fileId8: fileId.slice(0, 8),
      message: err instanceof Error ? err.message : String(err),
    });
    await ServerSync.importCatalogFile(fileId);
    return await save();
  }
}
