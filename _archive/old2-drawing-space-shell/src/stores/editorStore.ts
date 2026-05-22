import { create } from "zustand";
import type { EditorAdapter } from "@/types/editor";
import type { ServerFile } from "@/types/file";
import { getDocumentAdapter } from "@/features/documents";
import { editorRegistry } from "@/features/editor/EditorRegistry";
import { setCombinedLibraryFileId } from "@/features/library";
import {
  createPlaceholderThumbnailSvg,
  LocalThumbnailCache,
  prepareStoredThumbnailSvg,
} from "@/features/thumbnail";
import { isFileConflictError } from "@/services/apiError";
import { ServerSync } from "@/services/ServerSync";
import { useFileStore } from "@/stores/fileStore";
import { editorDebugLog } from "@/features/logging/editorDebugLog";
import { syncFileDeepLink } from "@/features/routing/fileDeepLink";
import { sanitizeExcalidrawAppState } from "@/editors/excalidraw/save";
import { emitAppNotice } from "@/features/ui/appNotice";
import { promoteTempFileToServer } from "@/features/tempFiles/promoteTempFile";
import { isLocalTempFileId } from "@/features/tempFiles/tempFileId";
import { TempFileStorage } from "@/features/tempFiles/TempFileStorage";
import {
  BrowserSceneStorage,
  DeltaStorage,
  FileSyncState,
  hashSceneData,
  hydrateExcalidrawSceneOnOpen,
  LocalData,
  LocalDraftStorage,
  LocalSceneCache,
  applySaveFileResult,
} from "@/features/sync";

interface EditorState {
  activeEditor: EditorAdapter | null;
  activeFile: ServerFile | null;
  isEditorMounted: boolean;
  saving: boolean;
  saveError: string | null;
  saveConflictOpen: boolean;
  saveConflictServerHash: string | null;

  openFile(file: ServerFile, data?: string): void;
  saveActiveFile(opts?: { forceOverwrite?: boolean }): Promise<void>;
  reloadActiveFileFromServer(): Promise<void>;
  dismissSaveConflict(): void;
  flushPendingDraft(): void;
  settleDraftState(fileId: string): void;
  closeEditor(): void;
  setMounted(mounted: boolean): void;
}

function kindToFormat(kind: string): string {
  switch (kind) {
    case "excalidraw": return ".excalidraw";
    case "mindmap": return ".smm";
    case "text": return ".txt";
    default: return `.${kind}`;
  }
}

let saveInFlight: Promise<void> | null = null;
let saveAgainRequested = false;
let draftTimer: number | null = null;
let draftThumbnailTimer: number | null = null;
let pendingDraftWrite: { fileId: string; serialized: string } | null = null;

function persistDraft(fileId: string, serialized: string, hash: string) {
  LocalDraftStorage.set(fileId, serialized, hash);
  FileSyncState.markDraft(fileId, hash);
}

function cancelDraftPendingFor(fileId?: string) {
  if (draftTimer) {
    window.clearTimeout(draftTimer);
    draftTimer = null;
  }
  if (draftThumbnailTimer) {
    window.clearTimeout(draftThumbnailTimer);
    draftThumbnailTimer = null;
  }
  if (!fileId || pendingDraftWrite?.fileId === fileId) {
    pendingDraftWrite = null;
  }
}

async function markFileSyncedAfterSave(fileId: string, payload: unknown, serverHash: string | null) {
  try {
    const localHash = await hashSceneData(payload);
    FileSyncState.markSynced(fileId, serverHash ?? localHash);
  } catch {
    FileSyncState.markSynced(fileId, serverHash);
  }
}

function applyBrowserSceneOverlay(file: ServerFile, data: string): string {
  if (file.kind !== "excalidraw") return data;
  const snapshot = BrowserSceneStorage.get(file.id);
  if (!snapshot?.appState) return data;
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    const source = parsed.data && typeof parsed.data === "object"
      ? parsed.data as Record<string, unknown>
      : parsed;
    const merged = {
      ...source,
      appState: {
        ...sanitizeExcalidrawAppState(
          source.appState && typeof source.appState === "object"
            ? source.appState as Record<string, unknown>
            : {},
        ),
        ...sanitizeExcalidrawAppState(snapshot.appState),
      },
    };
    if (parsed.data && typeof parsed.data === "object") {
      return JSON.stringify({ ...parsed, data: merged });
    }
    return JSON.stringify(merged);
  } catch {
    return data;
  }
}

export const useEditorStore = create<EditorState>((set, get) => ({
  activeEditor: null,
  activeFile: null,
  isEditorMounted: false,
  saving: false,
  saveError: null,
  saveConflictOpen: false,
  saveConflictServerHash: null,

  openFile(file: ServerFile, data?: string) {
    editorDebugLog("editorStore.openFile.enter", {
      fileId: file.id,
      fileName: file.name,
      kind: file.kind,
      hasData: data !== undefined,
      dataLength: typeof data === "string" ? data.length : 0,
      prevEditorId: get().activeEditor?.id ?? null,
      prevFileId: get().activeFile?.id ?? null,
    });

    const format = kindToFormat(file.kind);
    const meta = editorRegistry.getByFormat(format);
    if (!meta) {
      editorDebugLog("editorStore.openFile.error", {
        reason: "no-editor-meta",
        kind: file.kind,
        format,
      });
      console.warn(`No editor registered for kind: ${file.kind} (format: ${format})`);
      return;
    }

    const current = get().activeEditor;
    const canReuseEditor = current?.id === meta.id;
    if (current && !canReuseEditor) {
      editorDebugLog("editorStore.openFile.unmountPrevious", { editorId: current.id });
      get().flushPendingDraft();
      current.unmountSync?.() ?? current.unmount();
    }

    const editor = canReuseEditor && current
      ? current
      : editorRegistry.createById(meta.id);
    if (!editor) {
      editorDebugLog("editorStore.openFile.error", {
        reason: "createById-returned-null",
        metaId: meta.id,
      });
      return;
    }

    editorDebugLog("editorStore.openFile.editorCreated", {
      metaId: meta.id,
      editorId: editor.id,
      reused: canReuseEditor,
    });

    set({
      activeEditor: editor,
      activeFile: file,
      isEditorMounted: false,
      saveError: null,
      saveConflictOpen: false,
      saveConflictServerHash: null,
    });
    setCombinedLibraryFileId(isLocalTempFileId(file.id) ? null : file.id);
    editor.setFileContext?.(file.id);
    if (!isLocalTempFileId(file.id)) {
      FileSyncState.markOpened(file.id, file.content_sha256 ?? null);
    }
    void DeltaStorage.setFileId(
      file.kind === "excalidraw" && !isLocalTempFileId(file.id) ? file.id : null,
    );
    editor.onDidChange?.((changedData) => {
      if (get().saving) {
        saveAgainRequested = true;
        return;
      }
      if (file.kind === "excalidraw" && changedData && typeof changedData === "object") {
        const scene = changedData as {
          elements?: readonly unknown[];
          appState?: Record<string, unknown>;
          files?: Record<string, unknown>;
        };
        BrowserSceneStorage.set(file.id, {
          elements: scene.elements,
          appState: sanitizeExcalidrawAppState(scene.appState),
          files: scene.files,
        });
        void LocalData.saveFiles(scene.files);
        void DeltaStorage.record(file.id, {
          elements: scene.elements,
          appState: sanitizeExcalidrawAppState(scene.appState),
          files: scene.files,
        });
        LocalSceneCache.set(file.id, {
          elements: scene.elements,
          appState: scene.appState,
          files: scene.files,
          deltas: [],
        });
      }
      if (file.kind === "mindmap" && changedData && typeof changedData === "object") {
        LocalSceneCache.set(file.id, {
          document: changedData,
          deltas: [],
        });
      }
      if (draftTimer) window.clearTimeout(draftTimer);
      if (draftThumbnailTimer) window.clearTimeout(draftThumbnailTimer);
      const draftPayload = file.kind === "excalidraw" && changedData && typeof changedData === "object"
        ? {
          elements: (changedData as { elements?: unknown }).elements ?? [],
          appState: sanitizeExcalidrawAppState(
            (changedData as { appState?: Record<string, unknown> }).appState,
          ),
          files: (changedData as { files?: unknown }).files ?? {},
        }
        : changedData;
      const serialized = JSON.stringify(draftPayload);
      pendingDraftWrite = { fileId: file.id, serialized };
      draftTimer = window.setTimeout(() => {
        void hashSceneData(changedData).then((hash) => {
          persistDraft(file.id, serialized, hash);
          if (isLocalTempFileId(file.id)) {
            TempFileStorage.touch(file.id);
          }
          if (pendingDraftWrite?.fileId === file.id && pendingDraftWrite.serialized === serialized) {
            pendingDraftWrite = null;
          }
          if (get().saving) saveAgainRequested = true;
        });
      }, 500);
      draftThumbnailTimer = window.setTimeout(() => {
        void editor.getThumbnail(640, 384).then(async (thumbnailBlob) => {
          const svg = await thumbnailBlob.text();
          LocalThumbnailCache.set(file.id, svg);
          window.dispatchEvent(
            new CustomEvent("file-sync-state-change", { detail: { fileId: file.id } }),
          );
        }).catch(() => undefined);
      }, 1_000);
    });

    if (data) {
      void (async () => {
        editorDebugLog("editorStore.openFile.loadData.start", {
          fileId: file.id,
          kind: file.kind,
          editorId: editor.id,
        });
        let payload = applyBrowserSceneOverlay(file, data);
        if (file.kind === "excalidraw") {
          try {
            const parsed = JSON.parse(payload) as Record<string, unknown>;
            const source = parsed.data && typeof parsed.data === "object"
              ? parsed.data as Record<string, unknown>
              : parsed;
            const hydrated = await hydrateExcalidrawSceneOnOpen({
              elements: Array.isArray(source.elements) ? source.elements : [],
              appState: source.appState && typeof source.appState === "object"
                ? source.appState as Record<string, unknown>
                : {},
              files: source.files && typeof source.files === "object"
                ? source.files as Record<string, unknown>
                : {},
            });
            const merged = { ...source, ...hydrated };
            payload = parsed.data && typeof parsed.data === "object"
              ? JSON.stringify({ ...parsed, data: merged })
              : JSON.stringify(merged);
            const deltas = await DeltaStorage.list(file.id);
            if (deltas.length) {
              await DeltaStorage.restoreSnapshot(
                file.id,
                deltas.map((item) => item.payload),
              );
            }
          } catch {
            // Keep original payload if hydration fails.
          }
        }
        await editor.loadData(payload);
        editorDebugLog("editorStore.openFile.loadData.done", {
          fileId: file.id,
          editorId: editor.id,
          payloadLength: payload.length,
        });
      })().catch((error) => {
        editorDebugLog("editorStore.openFile.loadData.error", {
          fileId: file.id,
          editorId: editor.id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        console.error(error);
      });
    } else {
      editorDebugLog("editorStore.openFile.noDataPayload", {
        fileId: file.id,
        editorId: editor.id,
      });
    }
  },

  dismissSaveConflict() {
    set({ saveConflictOpen: false, saveConflictServerHash: null });
  },

  async reloadActiveFileFromServer() {
    const { activeEditor, activeFile } = get();
    if (!activeEditor || !activeFile) return;
    const loaded = await ServerSync.getFile(activeFile.id);
    LocalDraftStorage.remove(activeFile.id);
    FileSyncState.markSynced(activeFile.id, loaded.content_sha256 ?? null);
    useFileStore.getState().updateFile(activeFile.id, {
      updated_at: loaded.updated_at,
      content_sha256: loaded.content_sha256,
      has_thumbnail: loaded.has_thumbnail,
    });
    set({
      activeFile: loaded,
      saveConflictOpen: false,
      saveConflictServerHash: null,
      saveError: null,
    });
    await get().openFile(loaded, JSON.stringify(loaded.data ?? {}));
  },

  async saveActiveFile(opts) {
    if (saveInFlight) {
      saveAgainRequested = true;
      return saveInFlight;
    }

    const runSaveLoop = async () => {
      do {
        saveAgainRequested = false;
        get().flushPendingDraft();
        const { activeEditor, activeFile } = get();
        if (!activeEditor || !activeFile) return;
        cancelDraftPendingFor(activeFile.id);
        set({ saving: true, saveError: null, saveConflictOpen: false });
        try {
          if (isLocalTempFileId(activeFile.id)) {
            await promoteTempFileToServer();
            cancelDraftPendingFor(get().activeFile?.id);
            set({ saving: false, saveError: null });
            emitAppNotice({ level: "info", message: "已保存", key: "save-success" });
            return;
          }

          const saved = await activeEditor.saveData();
          const text = await saved.data.text();
          const rawData = JSON.parse(text);
          const adapter = getDocumentAdapter(activeFile.kind);
          const data = adapter
            ? adapter.toDocument(adapter.migrate(rawData) as never)
            : rawData;
          const thumbnailBlob = await activeEditor.getThumbnail(640, 384);
          const rawThumbnail = await thumbnailBlob.text();
          const thumbnail = rawThumbnail.includes("<svg")
            ? prepareStoredThumbnailSvg(rawThumbnail, activeFile.kind)
            : createPlaceholderThumbnailSvg({
              title: activeFile.name,
              kind: activeFile.kind,
            });
          const expectedHash = opts?.forceOverwrite
            ? undefined
            : FileSyncState.get(activeFile.id)?.baselineHash ?? activeFile.content_sha256 ?? null;
          const result = await ServerSync.saveFileImmediate(
            activeFile.id,
            data,
            activeFile.name,
            thumbnail,
            expectedHash,
          );
          LocalThumbnailCache.set(activeFile.id, thumbnail);
          const applied = applySaveFileResult(result, {
            updated_at: activeFile.updated_at,
            content_sha256: activeFile.content_sha256 ?? null,
          });
          const { updated_at, content_sha256 } = applied;
          cancelDraftPendingFor(activeFile.id);
          if (saveAgainRequested) {
            FileSyncState.markServerHash(activeFile.id, content_sha256 ?? null);
          } else {
            await markFileSyncedAfterSave(activeFile.id, data, content_sha256 ?? null);
            LocalDraftStorage.remove(activeFile.id);
          }
          if (activeFile.kind === "excalidraw" && data && typeof data === "object") {
            const record = data as Record<string, unknown>;
            const scene = record.data && typeof record.data === "object"
              ? record.data as Record<string, unknown>
              : record;
            LocalSceneCache.set(activeFile.id, {
              elements: scene.elements,
              appState: scene.appState,
              files: scene.files,
              deltas: (await DeltaStorage.list(activeFile.id)).map((item) => item.payload),
            });
          }
          if (activeFile.kind === "mindmap") {
            LocalSceneCache.set(activeFile.id, { document: data, deltas: [] });
          }
          useFileStore.getState().updateFile(activeFile.id, {
            updated_at,
            content_sha256,
            has_thumbnail: true,
          });
          set({
            saving: false,
            activeFile: { ...activeFile, updated_at, content_sha256, has_thumbnail: true },
          });
          emitAppNotice({ level: "info", message: "已保存", key: "save-success" });
          window.dispatchEvent(
            new CustomEvent("file-archives-change", { detail: { fileId: activeFile.id } }),
          );
        } catch (error) {
          if (isFileConflictError(error)) {
            const serverHash = typeof error.body?.content_sha256 === "string"
              ? error.body.content_sha256
              : null;
            set({
              saving: false,
              saveError: "服务器版本已更新，请选择加载或覆盖保存。",
              saveConflictOpen: true,
              saveConflictServerHash: serverHash,
            });
            return;
          }
          const message = error instanceof Error ? error.message : String(error);
          set({
            saving: false,
            saveError: message,
            saveConflictOpen: false,
          });
          emitAppNotice({ level: "error", message, key: "save-error" });
          throw error;
        }
      } while (saveAgainRequested);
    };

    saveInFlight = runSaveLoop().finally(() => {
      saveInFlight = null;
      saveAgainRequested = false;
    });
    return saveInFlight;
  },

  settleDraftState(fileId: string) {
    cancelDraftPendingFor(fileId);
  },

  flushPendingDraft() {
    if (!pendingDraftWrite) return;
    if (draftTimer) {
      window.clearTimeout(draftTimer);
      draftTimer = null;
    }
    if (draftThumbnailTimer) {
      window.clearTimeout(draftThumbnailTimer);
      draftThumbnailTimer = null;
    }
    const { fileId, serialized } = pendingDraftWrite;
    persistDraft(fileId, serialized, `pending:${Date.now()}`);
    pendingDraftWrite = null;
  },

  closeEditor() {
    editorDebugLog("editorStore.closeEditor", {
      fileId: get().activeFile?.id ?? null,
      editorId: get().activeEditor?.id ?? null,
    });
    get().flushPendingDraft();
    const current = get().activeEditor;
    if (current) {
      current.unmount();
    }
    void DeltaStorage.setFileId(null);
    setCombinedLibraryFileId(null);
    syncFileDeepLink(null);
    set({
      activeEditor: null,
      activeFile: null,
      isEditorMounted: false,
      saveConflictOpen: false,
      saveConflictServerHash: null,
    });
  },

  setMounted(mounted: boolean) {
    set({ isEditorMounted: mounted });
  },
}));
