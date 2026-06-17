import { useCallback, useEffect, useRef } from "react";

import { patchFileListTreeCacheFileName } from "../../data/fileListSessionCache";
import { DEFAULT_DOCUMENT_DISPLAY_NAME } from "../../data/defaultDocumentName";
import {
  getMindMapRootPlainText,
  getMindMapRootText,
} from "../../data/formats/MindMapAdapter";
import { isLocalDraftFileId } from "../../data/localDraftFileId";
import { LocalDraftSessions } from "../../data/localDraftSessions";
import { ServerSync } from "../../data/ServerSync";

import { reconcileMindMapRootAndFileName } from "./mindMapRootNamePolicy";

import type { MindMapDocumentData } from "../../data/formats/MindMapAdapter";

export { resolveMindMapOpenDisplayName } from "./mindMapRootNamePolicy";

/**
 * Bidirectional sync between MindMap root-node text and the file display name.
 *
 * Direction A  (root → file):
 *   Call `onDocumentChanged(data)` whenever the native MindMap document
 *   changes.  If the root-node label differs from the last-known value,
 *   `setFileName` is called and the server/local-draft name is updated.
 *
 * Direction B  (file → root):
 *   Listens for the `excalidraw-file-renamed` custom DOM event (dispatched
 *   by the file-list controller).  On match it updates `setFileName` and
 *   calls `postToNative("updateRootText", …)` so the native iframe reflects
 *   the new name.
 *
 * A `lastSyncedText` ref prevents A→B→A infinite loops.
 */
export function useMindMapRootNameSync({
  fileId,
  setFileName,
  isBridgeReady,
  postToNative,
}: {
  fileId: string | null;
  setFileName: (name: string) => void;
  isBridgeReady: boolean;
  postToNative: (type: string, payload: Record<string, unknown>) => void;
}) {
  const lastSyncedTextRef = useRef<string | null>(null);

  const initSyncedText = useCallback((data: MindMapDocumentData) => {
    lastSyncedTextRef.current = getMindMapRootText(data);
  }, []);

  const promoteRootToFileName = useCallback(
    (name: string) => {
      lastSyncedTextRef.current = name;
      setFileName(name);
      if (!fileId) {
        return;
      }
      if (!isLocalDraftFileId(fileId)) {
        patchFileListTreeCacheFileName(fileId, name);
        void ServerSync.renameFile(fileId, name).catch(() => {});
        return;
      }
      const session = LocalDraftSessions.get(fileId);
      if (session) {
        LocalDraftSessions.upsert({
          ...session,
          name,
          updated_at: new Date().toISOString(),
        });
      }
    },
    [fileId, setFileName],
  );

  /** 对齐根节点与文件显示名；只修文件名时不依赖 native bridge。 */
  const syncFileNameToRootIfNeeded = useCallback(
    (displayName: string, data?: MindMapDocumentData | null) => {
      const rootPlainText = data
        ? getMindMapRootPlainText(data)
        : (lastSyncedTextRef.current ?? "");
      const action = reconcileMindMapRootAndFileName(
        displayName,
        rootPlainText,
      );
      if (action.kind === "noop") {
        return false;
      }
      if (action.kind === "promote-root-to-file") {
        promoteRootToFileName(action.name);
        return true;
      }
      if (!isBridgeReady) {
        return false;
      }
      lastSyncedTextRef.current = action.text;
      postToNative("updateRootText", { text: action.text });
      return true;
    },
    [isBridgeReady, postToNative, promoteRootToFileName],
  );

  const onDocumentChanged = useCallback(
    (data: MindMapDocumentData) => {
      if (!fileId) return;
      const rootPlainText = getMindMapRootPlainText(data);
      const displayName =
        rootPlainText || DEFAULT_DOCUMENT_DISPLAY_NAME;

      if (displayName === lastSyncedTextRef.current) {
        return;
      }
      promoteRootToFileName(displayName);
    },
    [fileId, promoteRootToFileName],
  );

  useEffect(() => {
    const onFileRenamed = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.id !== fileId) return;
      const newName = String(detail.name || "").trim();
      if (!newName) return;
      lastSyncedTextRef.current = newName;
      setFileName(newName);
      if (isBridgeReady) {
        postToNative("updateRootText", { text: newName });
      }
    };
    window.addEventListener("excalidraw-file-renamed", onFileRenamed);
    return () => {
      window.removeEventListener("excalidraw-file-renamed", onFileRenamed);
    };
  }, [fileId, isBridgeReady, postToNative, setFileName]);

  return { initSyncedText, onDocumentChanged, syncFileNameToRootIfNeeded };
}
