import { debounce } from "@excalidraw/common";
import { useCallback, useEffect, useRef } from "react";

import { notifyEdit } from "../../data/autoSaveSession";
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

export function useMindMapDraftTracking(fileId: string | null) {
  const debouncedRef = useRef(
    debounce((targetFileId: string, getDocument: () => MindMapSaveDocument | null) => {
      if (getFileIdFromHash() !== targetFileId) {
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
      traceMindMapOperation("draftTracking.debounce.evaluate", {
        fileId8: targetFileId.slice(0, 8),
        document: summarizeMindMapTraceDocument(document),
        modificationState: state,
        fileStateBeforeApply: readMindMapTraceFileState(targetFileId),
      });
      const hash = state.modified
        ? (state.contentHash ?? hashDocumentSnapshot(document))
        : (state.baselineHash ??
          state.contentHash ??
          hashDocumentSnapshot(document));

      if (state.modified) {
        FileSyncState.setLocalCache(
          targetFileId,
          toMindMapLocalCacheRecord(document),
        );
      }
      applyFileModificationState(targetFileId, state, {
        reason: "draftTracking.debounce",
      });
      traceMindMapOperation("draftTracking.debounce.afterApply", {
        fileId8: targetFileId.slice(0, 8),
        modified: state.modified,
        hash,
        fileStateAfterApply: readMindMapTraceFileState(targetFileId),
      });
      debugMindMapPersist("[DEBUG] draft hash updated", {
        fileId8: targetFileId.slice(0, 8),
        modified: state.modified,
        draftHash8: hash.slice(0, 8),
        baselineHash8: state.baselineHash?.slice(0, 8) ?? null,
      });
      if (!state.modified) {
        return;
      }
      if (isLocalDraftFileId(targetFileId)) {
        notifyLocalDraftEdited(targetFileId);
      }
    }, 450),
  );

  useEffect(() => {
    const debounced = debouncedRef.current;
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
      debouncedRef.current(fileId, () => document);
      notifyEdit();
      traceMindMapOperation("draftTracking.markDocumentChanged.queued", {
        fileId8: fileId.slice(0, 8),
        document: summarizeMindMapTraceDocument(document),
        fileStateAtQueue: readMindMapTraceFileState(fileId),
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
      notifyEdit();
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
    notifyEdit();
    if (isLocalDraftFileId(fileId)) {
      notifyLocalDraftEdited(fileId);
    }
  }, [fileId]);

  const flushDraft = useCallback(() => {
    debouncedRef.current.flush();
  }, []);

  return { markDocumentChanged, markNativeDocumentDirty, flushDraft };
}
