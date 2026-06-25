import {
  isCorruptCatalogFile,
} from "./catalogCapabilities";
import { editorRegistry } from "../editors/registry";

import {
  getServerSyncErrorJson,
  ServerSync,
  ServerSyncError,
  type ServerFile,
} from "./ServerSync";
import { recordRecentFilePath } from "./recentFiles";

export type OpenCatalogFromPathResult =
  | {
      status: "open";
      file: ServerFile;
      catalogId: string;
      kind: string;
      tracked?: boolean;
    }
  | { status: "preview"; file: ServerFile; tracked?: boolean }
  | { status: "error"; message: string; code?: string };

export function formatOpenCatalogFromPathError(error: unknown): string {
  if (error instanceof ServerSyncError) {
    const payload = getServerSyncErrorJson(error) as {
      error?: string;
      code?: string;
    } | null;
    if (payload?.error) {
      return payload.error;
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function resolveOpenCatalogFromPathResult(
  file: ServerFile,
  normalizedPath: string,
  tracked?: boolean,
): OpenCatalogFromPathResult {
  recordRecentFilePath(normalizedPath);

  if (isCorruptCatalogFile(file)) {
    return { status: "preview", file, tracked };
  }

  const kind = editorRegistry.resolveKind(file.kind);
  return {
    status: "open",
    file,
    catalogId: file.id,
    kind,
    tracked,
  };
}

export async function openCatalogFromPath(
  absPath: string,
): Promise<OpenCatalogFromPathResult> {
  const normalized = absPath.trim();
  if (!normalized) {
    return { status: "error", message: "缺少文件路径", code: "missing_path" };
  }

  try {
    const { file, absPath } = await ServerSync.resolveCatalogFileByPath(normalized);
    return resolveOpenCatalogFromPathResult(file, absPath);
  } catch (error) {
    const payload = getServerSyncErrorJson(error) as {
      error?: string;
      code?: string;
    } | null;
    return {
      status: "error",
      message: formatOpenCatalogFromPathError(error),
      code: payload?.code,
    };
  }
}

export async function openOrTrackCatalogFromPath(
  absPath: string,
): Promise<OpenCatalogFromPathResult> {
  const normalized = absPath.trim();
  if (!normalized) {
    return { status: "error", message: "缺少文件路径", code: "missing_path" };
  }

  try {
    const { file, absPath } = await ServerSync.resolveCatalogFileByPath(normalized);
    return resolveOpenCatalogFromPathResult(file, absPath);
  } catch (error) {
    const payload = getServerSyncErrorJson(error) as {
      error?: string;
      code?: string;
    } | null;
    if (payload?.code !== "not_in_catalog") {
      return {
        status: "error",
        message: formatOpenCatalogFromPathError(error),
        code: payload?.code,
      };
    }
  }

  try {
    const { file, absPath, tracked } =
      await ServerSync.trackCatalogFileByPath(normalized);
    return resolveOpenCatalogFromPathResult(file, absPath, tracked);
  } catch (error) {
    const payload = getServerSyncErrorJson(error) as {
      error?: string;
      code?: string;
    } | null;
    return {
      status: "error",
      message: formatOpenCatalogFromPathError(error),
      code: payload?.code,
    };
  }
}

