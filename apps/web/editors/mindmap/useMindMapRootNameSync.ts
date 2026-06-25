import { useCallback, useEffect, useRef } from "react";

import { getMindMapRootText } from "../../data/formats/MindMapAdapter";

import type { MindMapDocumentData } from "../../data/formats/MindMapAdapter";

export { resolveMindMapOpenDisplayName } from "./mindMapRootNamePolicy";

/**
 * Tracks MindMap root text for first-save naming only. After creation, the
 * external file name and the root node title are intentionally independent.
 */
export function useMindMapRootNameSync({
  fileId,
  setFileName,
  isBridgeReady: _isBridgeReady,
  postToNative: _postToNative,
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

  /** File names and root labels are independent after creation. */
  const syncFileNameToRootIfNeeded = useCallback(
    (_displayName: string, data?: MindMapDocumentData | null) => {
      if (data) {
        lastSyncedTextRef.current = getMindMapRootText(data);
      }
      return false;
    },
    [],
  );

  const onDocumentChanged = useCallback(
    (data: MindMapDocumentData) => {
      lastSyncedTextRef.current = getMindMapRootText(data);
    },
    [],
  );

  useEffect(() => {
    const onFileRenamed = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.id !== fileId) {
        return;
      }
      const newName = String(detail.name || "").trim();
      if (!newName) {
        return;
      }
      setFileName(newName);
    };
    window.addEventListener("excalidraw-file-renamed", onFileRenamed);
    return () => {
      window.removeEventListener("excalidraw-file-renamed", onFileRenamed);
    };
  }, [fileId, setFileName]);

  return { initSyncedText, onDocumentChanged, syncFileNameToRootIfNeeded };
}
