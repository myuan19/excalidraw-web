import {
  DEFAULT_DATA_DIRECTORY_PATH,
  getAppSettings,
} from "./appSettings";
import { ServerSync, type MappingRootResult } from "./ServerSync";

/** Desktop preload 提供的选目录能力。 */
export async function pickMappedFolderPath(): Promise<string | null> {
  const desktop = window.editorHubDesktop;
  if (!desktop?.pickFolder) {
    throw new Error("当前环境不支持选择本地文件夹");
  }
  return desktop.pickFolder();
}

export async function addMappedFolderRoot(opts?: {
  absPath?: string;
  parentFolderId?: string | null;
}) {
  const absPath = opts?.absPath ?? (await pickMappedFolderPath());
  if (!absPath) {
    return null;
  }
  return ServerSync.addMappingRoot(absPath, opts?.parentFolderId ?? null);
}

export async function resolveDefaultDataDirectoryPath(): Promise<string> {
  const configuredPath = getAppSettings().defaultDataDirectoryPath.trim();
  if (
    configuredPath === DEFAULT_DATA_DIRECTORY_PATH &&
    window.editorHubDesktop?.getDefaultDataDirectoryPath
  ) {
    const desktopPath = await window.editorHubDesktop.getDefaultDataDirectoryPath();
    if (desktopPath?.trim()) {
      return desktopPath.trim();
    }
  }
  return configuredPath;
}

export async function ensureDefaultDataDirectoryMapped(): Promise<MappingRootResult | null> {
  const absPath = await resolveDefaultDataDirectoryPath();
  if (!absPath) {
    return null;
  }
  return addMappedFolderRoot({ absPath });
}
