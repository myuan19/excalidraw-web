import { editorRegistry } from "../editors/registry";
import {
  clearNativeThumbnailPending,
  markNativeThumbnailPending,
} from "./nativeThumbnailPending";
import {
  isCorruptCatalogFile,
} from "./catalogCapabilities";
import { ExcalidrawAdapter } from "./formats/ExcalidrawAdapter";
import { MindMapAdapter } from "./formats/MindMapAdapter";
import { generateExcalidrawThumbnailAndCache } from "./excalidrawThumbnail";
import { generateMindMapThumbnailAndCache } from "./mindMapThumbnail";
import { LocalThumbnailCache } from "./localThumbnailCache";
import { formatOpenCatalogFromPathError } from "./openCatalogFromPath";
import { isLocalDraftFileId } from "./localDraftFileId";
import {
  getServerSyncErrorJson,
  ServerSync,
  type ServerFile,
} from "./ServerSync";
import { recordRecentFilePath } from "./recentFiles";
import { clearThumbnailServerMiss } from "./thumbnailServerFetchMiss";
import { finalizeSavedThumbnail } from "./thumbnailLifecycle";

export type TrackCatalogPathsResult = {
  tracked: number;
  errors: string[];
  filesByPath: Record<string, ServerFile>;
};

function catalogPathErrorCode(error: unknown): string | undefined {
  const payload = getServerSyncErrorJson(error) as { code?: string } | null;
  return payload?.code;
}

/** Whether a tracked catalog file still needs client-side native thumbnail generation. */
export function fileAwaitingNativeThumbnail(file: ServerFile): boolean {
  if (isCorruptCatalogFile(file)) {
    return false;
  }
  const kind = editorRegistry.resolveKind(file.kind);
  if (kind !== "mindmap" && kind !== "excalidraw") {
    return false;
  }
  return !LocalThumbnailCache.getForContent(file.id, file.content_sha256);
}

export async function persistTrackedFileThumbnail(
  file: ServerFile,
): Promise<ServerFile> {
  if (isLocalDraftFileId(file.id)) {
    return file;
  }
  if (isCorruptCatalogFile(file)) {
    return file;
  }
  const full = await ServerSync.getFile(file.id, { force: true });
  const kind = editorRegistry.resolveKind(full.kind);
  let thumbnail: string | undefined;
  if (kind === "mindmap" && full.data != null) {
    const data = MindMapAdapter.parse(full.data);
    thumbnail = await generateMindMapThumbnailAndCache(file.id, data);
  } else if (kind === "excalidraw" && full.data != null) {
    const parsed = ExcalidrawAdapter.parse(full.data);
    thumbnail = await generateExcalidrawThumbnailAndCache(file.id, {
      elements: parsed.elements ?? [],
      appState: parsed.appState ?? {},
      files: parsed.files ?? {},
    });
  }
  if (!thumbnail) {
    return file;
  }
  const saved = await ServerSync.saveThumbnailOnly(file.id, thumbnail, file.name);
  clearThumbnailServerMiss(file.id);
  const contentSha = saved.content_sha256 ?? full.content_sha256 ?? null;
  finalizeSavedThumbnail({
    fileId: file.id,
    kind,
    name: saved.name ?? file.name,
    contentSha,
    version: saved.version ?? file.version ?? null,
    updatedAt: saved.updated_at ?? file.updated_at,
    thumbnail,
  });
  return {
    ...file,
    has_thumbnail: true,
    content_sha256: contentSha,
    updated_at: saved.updated_at ?? file.updated_at,
  };
}

async function trackOneCatalogPath(
  absPathInput: string,
): Promise<{ absPath: string; file: ServerFile }> {
  const normalized = absPathInput.trim();
  if (!normalized) {
    throw new Error("缺少文件路径");
  }
  try {
    return await ServerSync.resolveCatalogFileByPath(normalized);
  } catch (error) {
    if (catalogPathErrorCode(error) !== "not_in_catalog") {
      throw error;
    }
  }
  return await ServerSync.trackCatalogFileByPath(normalized);
}

/** Track paths in catalog + recent list only; thumbnails generated separately. */
export async function trackCatalogPathsToRecent(
  absPaths: string[],
): Promise<TrackCatalogPathsResult> {
  const errors: string[] = [];
  const filesByPath: Record<string, ServerFile> = {};
  let tracked = 0;
  for (const absPath of absPaths) {
    try {
      const { absPath: canonicalPath, file } = await trackOneCatalogPath(absPath);
      recordRecentFilePath(canonicalPath);
      filesByPath[canonicalPath] = {
        ...file,
        has_thumbnail: false,
      };
      tracked += 1;
    } catch (error) {
      errors.push(formatOpenCatalogFromPathError(error));
    }
  }
  return { tracked, errors, filesByPath };
}

export async function generateRecentPathThumbnails(
  filesByPath: Record<string, ServerFile>,
): Promise<Record<string, ServerFile>> {
  const pendingIds = Object.values(filesByPath)
    .filter(fileAwaitingNativeThumbnail)
    .map((file) => file.id);
  if (pendingIds.length === 0) {
    return filesByPath;
  }
  markNativeThumbnailPending(pendingIds);
  const next: Record<string, ServerFile> = { ...filesByPath };
  try {
    for (const [canonicalPath, file] of Object.entries(filesByPath)) {
      if (!fileAwaitingNativeThumbnail(file)) {
        continue;
      }
      try {
        let displayFile = await persistTrackedFileThumbnail(file);
        try {
          const resolved =
            await ServerSync.resolveCatalogFileByPath(canonicalPath);
          displayFile = resolved.file;
        } catch {
          // Keep post-persist metadata if resolve fails transiently.
        }
        next[canonicalPath] = displayFile;
      } catch {
        // Thumbnail failure should not remove the recent entry.
      }
    }
  } finally {
    clearNativeThumbnailPending(pendingIds);
  }
  return next;
}
