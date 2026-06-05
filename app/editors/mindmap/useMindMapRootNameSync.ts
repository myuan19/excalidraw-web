import { useCallback, useEffect, useRef } from "react";

import { getMindMapRootText } from "../../data/formats/MindMapAdapter";
import { isLocalDraftFileId } from "../../data/localDraftFileId";
import { LocalDraftSessions } from "../../data/localDraftSessions";
import { ServerSync } from "../../data/ServerSync";

import type { MindMapDocumentData } from "../../data/formats/MindMapAdapter";

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

  const onDocumentChanged = useCallback(
    (data: MindMapDocumentData) => {
      if (!fileId) return;
      const rootText = getMindMapRootText(data);
      if (!rootText || rootText === lastSyncedTextRef.current) {
        return;
      }
      lastSyncedTextRef.current = rootText;
      setFileName(rootText);
      if (!isLocalDraftFileId(fileId)) {
        void ServerSync.renameFile(fileId, rootText).catch(() => {});
      } else {
        const session = LocalDraftSessions.get(fileId);
        if (session) {
          LocalDraftSessions.upsert({
            ...session,
            name: rootText,
            updated_at: new Date().toISOString(),
          });
        }
      }
    },
    [fileId, setFileName],
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

  return { initSyncedText, onDocumentChanged };
}
