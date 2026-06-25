import { devDebug } from "../lib/devDebug";
import { traceUserAction, traceUserError } from "../lib/userTrace";

import { FileSyncState } from "./FileSyncState";
import { isLocalDraftFileId } from "./localDraftFileId";
import { isLocalCacheConsistentWithServerHash } from "./localCacheServerConsistency";
import { LocalDraftSessions } from "./localDraftSessions";
import { ServerSync, type ServerFile } from "./ServerSync";

function rebuildServerFileFromLocalCache(
  fileId: string,
  contentSha256: string | null,
): ServerFile | null {
  const local = FileSyncState.getLocalCache(fileId);
  if (!local) {
    return null;
  }
  const doc = (
    local as { document?: { kind?: string; name?: string; data?: unknown } }
  ).document;
  if (doc?.kind === "mindmap") {
    return {
      id: fileId,
      name: doc.name ?? "",
      kind: "mindmap",
      created_at: "",
      updated_at: "",
      content_sha256: contentSha256,
      version: local.meta?.serverVersion,
      origin: "managed",
      data: doc,
    };
  }
  if (Array.isArray((local as { elements?: unknown }).elements)) {
    return {
      id: fileId,
      name: "",
      kind: "excalidraw",
      created_at: "",
      updated_at: "",
      content_sha256: contentSha256,
      version: local.meta?.serverVersion,
      origin: "managed",
      data: {
        elements: (local as { elements: unknown }).elements,
        appState: (local as { appState?: unknown }).appState ?? {},
        files: (local as { files?: unknown }).files ?? {},
      },
    };
  }
  return null;
}

function resolveLocalDraftData(cache: unknown): unknown {
  if (!cache || typeof cache !== "object") {
    return cache;
  }
  const record = cache as { document?: { data?: unknown } | unknown };
  if (record.document && typeof record.document === "object") {
    const doc = record.document as { data?: unknown };
    return doc.data ?? record.document;
  }
  return cache;
}

/**
 * 编辑器打开文档：local-draft 只读浏览器缓存，正式文件经 apiTransport（Web: /api/files/:id；Desktop: IPC）。
 */
export async function loadEditorServerFile(
  fileId: string,
  opts?: { force?: boolean },
): Promise<ServerFile> {
  traceUserAction("editor-open", "loadEditorServerFile", {
    fileId8: fileId.slice(0, 8),
    isLocalDraft: isLocalDraftFileId(fileId),
    force: !!opts?.force,
  }, "start");

  try {
    if (isLocalDraftFileId(fileId)) {
      devDebug("api-sync", "loadEditorServerFile | local-draft", {
        fileId8: fileId.slice(0, 20),
      });
      const meta = LocalDraftSessions.get(fileId);
      if (!meta) {
        devDebug("api-sync", "loadEditorServerFile | local-draft meta missing", {
          fileId8: fileId.slice(0, 20),
        });
        throw new Error("草稿不存在或已放弃");
      }
      const cache = FileSyncState.getLocalCache(fileId);
      if (!cache) {
        devDebug("api-sync", "loadEditorServerFile | local-draft cache missing", {
          fileId8: fileId.slice(0, 20),
        });
        throw new Error("草稿本地缓存缺失");
      }
      const file = {
        id: fileId,
        name: meta.name,
        kind: meta.kind,
        created_at: meta.created_at,
        updated_at: meta.updated_at,
        folder_id: meta.folder_id ?? null,
        content_sha256: FileSyncState.getBaselineHash(fileId),
        data: resolveLocalDraftData(cache),
      };
      traceUserAction("editor-open", "loadEditorServerFile", {
        fileId8: fileId.slice(0, 8),
        kind: meta.kind,
        path: "local-draft",
      }, "ok");
      return file;
    }

    devDebug("api-sync", "loadEditorServerFile | fetch", {
      fileId8: fileId.slice(0, 8),
      force: !!opts?.force,
    });
    if (!opts?.force && FileSyncState.hasUnsavedChanges(fileId)) {
      const serverHash = FileSyncState.getServerHash(fileId);
      const rebuilt = rebuildServerFileFromLocalCache(fileId, serverHash);
      if (
        rebuilt &&
        isLocalCacheConsistentWithServerHash(fileId, serverHash)
      ) {
        devDebug("api-sync", "loadEditorServerFile | local-cache recovery", {
          fileId8: fileId.slice(0, 8),
        });
        traceUserAction("editor-open", "loadEditorServerFile", {
          fileId8: fileId.slice(0, 8),
          kind: rebuilt.kind,
          path: "local-cache-recovery",
        }, "ok");
        return rebuilt;
      }
    }

    const file = await ServerSync.getFile(fileId, opts);
    devDebug("api-sync", "loadEditorServerFile | ok", {
      fileId8: fileId.slice(0, 8),
      kind: file.kind ?? null,
    });
    traceUserAction("editor-open", "loadEditorServerFile", {
      fileId8: fileId.slice(0, 8),
      kind: file.kind ?? null,
      path: "server",
      sha8: file.content_sha256?.slice(0, 8) ?? null,
    }, "ok");
    return file;
  } catch (err) {
    traceUserError("editor-open", "loadEditorServerFile", err, {
      fileId8: fileId.slice(0, 8),
    });
    devDebug("api-sync", "loadEditorServerFile | failed", {
      fileId8: fileId.slice(0, 8),
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
