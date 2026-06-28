import { debounce } from "@excalidraw/common";
import { useCallback, useEffect, useRef } from "react";

import { notifyEditForFile } from "../../data/autoSaveSession";
import {
  applyFileModificationState,
  evaluateCurrentFileModificationState,
} from "../../data/fileModificationState";
import { FileSyncState } from "../../data/FileSyncState";
import { getFileIdFromHash } from "../../data/fileIdFromHash";
import { isLocalDraftFileId } from "../../data/localDraftFileId";
import { notifyLocalDraftEdited } from "../../data/localDraftSessions";
import {
  readMindMapTraceFileState,
  summarizeMindMapTraceDocument,
  traceMindMapOperation,
} from "../../data/mindMapOperationTrace";
import { hashDocumentSnapshot } from "../../data/sceneHash";
import {
  clearMindMapDraftIfUnchanged,
  isMindMapNativeDirtyPending,
  markMindMapNativeDirtyPending,
  type MindMapSaveDocument,
} from "./mindMapDraftState";
import { matchesMindMapPersistedSnapshot } from "./mindMapPersistedSnapshot";
import { toMindMapLocalCacheRecord } from "./mindMapLocalCacheRecord";
import { debugMindMapPersist } from "./mindMapPersistDebug";

export function useMindMapDraftTracking(
  fileId: string | null,
  opts?: { allowInactiveFile?: boolean },
) {
  const allowInactiveFileRef = useRef(opts?.allowInactiveFile === true);
  allowInactiveFileRef.current = opts?.allowInactiveFile === true;
  const debouncedCacheRef = useRef(
    debounce((targetFileId: string, getDocument: () => MindMapSaveDocument | null) => {
      if (!allowInactiveFileRef.current && getFileIdFromHash() !== targetFileId) {
        return;
      }
      const document = getDocument();
      if (!document) {
        return;
      }
      const state = evaluateCurrentFileModificationState({
        fileId: targetFileId,
        kind: "mindmap",
        mindMapDocument: document,
      });
      traceMindMapOperation("draftTracking.debounce.cache", {
        fileId8: targetFileId.slice(0, 8),
        document: summarizeMindMapTraceDocument(document),
        modificationState: state,
        fileStateBeforeCache: readMindMapTraceFileState(targetFileId),
      });
      if (!state.modified) {
        return;
      }
      FileSyncState.setLocalCache(
        targetFileId,
        toMindMapLocalCacheRecord(document),
      );
      traceMindMapOperation("draftTracking.debounce.afterCache", {
        fileId8: targetFileId.slice(0, 8),
        modified: state.modified,
        fileStateAfterCache: readMindMapTraceFileState(targetFileId),
      });
      if (isLocalDraftFileId(targetFileId)) {
        notifyLocalDraftEdited(targetFileId);
      }
    }, 450),
  );

  useEffect(() => {
    const debounced = debouncedCacheRef.current;
    return () => {
      debounced.cancel();
    };
  }, []);

  const markDocumentChanged = useCallback(
    (document: MindMapSaveDocument) => {
      if (!fileId) {
        return;
      }
      if (
        !isMindMapNativeDirtyPending(fileId) &&
        matchesMindMapPersistedSnapshot(fileId, document)
      ) {
        traceMindMapOperation(
          "draftTracking.markDocumentChanged.matchesPersistedSnapshot",
          {
            fileId8: fileId.slice(0, 8),
            document: summarizeMindMapTraceDocument(document),
            fileState: readMindMapTraceFileState(fileId),
          },
        );
        debugMindMapPersist("[DEBUG] markDocumentChanged | matches-persisted", {
          fileId8: fileId.slice(0, 8),
        });
        return;
      }
      if (clearMindMapDraftIfUnchanged(fileId, document)) {
        traceMindMapOperation("draftTracking.markDocumentChanged.unchanged", {
          fileId8: fileId.slice(0, 8),
          document: summarizeMindMapTraceDocument(document),
          fileState: readMindMapTraceFileState(fileId),
        });
        debugMindMapPersist("[DEBUG] markDocumentChanged | unchanged", {
          fileId8: fileId.slice(0, 8),
        });
        return;
      }
      const state = evaluateCurrentFileModificationState({
        fileId,
        kind: "mindmap",
        mindMapDocument: document,
      });
      applyFileModificationState(fileId, state, {
        reason: "draftTracking.markDocumentChanged.immediate",
      });
      traceMindMapOperation("draftTracking.markDocumentChanged.applied", {
        fileId8: fileId.slice(0, 8),
        modified: state.modified,
        document: summarizeMindMapTraceDocument(document),
        fileStateAfterApply: readMindMapTraceFileState(fileId),
      });
      if (!state.modified) {
        return;
      }
      debouncedCacheRef.current(fileId, () => document);
      notifyEditForFile(fileId, {
        allowInactiveFile: allowInactiveFileRef.current,
      });
      debugMindMapPersist("[DEBUG] markDocumentChanged", {
        fileId8: fileId.slice(0, 8),
        contentHash8: hashDocumentSnapshot(document).slice(0, 8),
        baselineHash8: FileSyncState.getBaselineHash(fileId)?.slice(0, 8) ?? null,
      });
    },
    [fileId],
  );

  const markNativeDocumentDirty = useCallback(() => {
    if (!fileId) {
      notifyEditForFile(null);
      return;
    }
    const changed = markMindMapNativeDirtyPending(fileId);
    traceMindMapOperation("draftTracking.markNativeDocumentDirty", {
      fileId8: fileId.slice(0, 8),
      changed,
      fileStateAfterPending: readMindMapTraceFileState(fileId),
    });
    debugMindMapPersist("[DEBUG] markNativeDocumentDirty", {
      fileId8: fileId.slice(0, 8),
      changed,
      baselineHash8: FileSyncState.getBaselineHash(fileId)?.slice(0, 8) ?? null,
      draftHash8: FileSyncState.getDraftHash(fileId)?.slice(0, 8) ?? null,
    });
    notifyEditForFile(fileId, {
      allowInactiveFile: allowInactiveFileRef.current,
    });
    if (isLocalDraftFileId(fileId)) {
      notifyLocalDraftEdited(fileId);
    }
  }, [fileId]);

  const flushDraft = useCallback(() => {
    debouncedCacheRef.current.flush();
  }, []);

  return { markDocumentChanged, markNativeDocumentDirty, flushDraft };
}
