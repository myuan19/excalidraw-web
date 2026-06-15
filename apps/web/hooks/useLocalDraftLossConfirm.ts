import { useCallback, useRef, useState } from "react";

import { discardLocalDraftSession } from "../data/discardLocalDraftSession";
import { isLocalDraftFileId } from "../data/localDraftFileId";
import { LocalDraftSessions } from "../data/localDraftSessions";
import { clearAppShellPendingNavigation } from "../shell/appShellNavigate";

export function getLocalDraftDisplayName(fileId: string): string {
  return LocalDraftSessions.get(fileId)?.name?.trim() || "未命名";
}

/**
 * 临时文档（local-draft）放弃前的二次确认。
 * 调用方在 onConfirmed 中执行导航；本 hook 负责 discardLocalDraftSession。
 */
export function useLocalDraftLossConfirm(opts: {
  getFileId: () => string | null;
}) {
  const { getFileId } = opts;
  const [open, setOpen] = useState(false);
  const [documentName, setDocumentName] = useState("未命名");
  const pendingActionRef = useRef<(() => void) | null>(null);

  const dismiss = useCallback(() => {
    setOpen(false);
    pendingActionRef.current = null;
    clearAppShellPendingNavigation();
  }, []);

  /**
   * 若为临时文档则弹出确认并返回 true；否则返回 false，由调用方继续普通放弃流程。
   */
  const requestConfirm = useCallback(
    (onConfirmed: () => void): boolean => {
      const fileId = getFileId();
      if (!fileId || !isLocalDraftFileId(fileId)) {
        return false;
      }
      setDocumentName(getLocalDraftDisplayName(fileId));
      pendingActionRef.current = onConfirmed;
      setOpen(true);
      return true;
    },
    [getFileId],
  );

  const confirmLoss = useCallback(async () => {
    const fileId = getFileId();
    const action = pendingActionRef.current;
    setOpen(false);
    pendingActionRef.current = null;
    if (fileId && isLocalDraftFileId(fileId)) {
      await discardLocalDraftSession(fileId);
    }
    action?.();
  }, [getFileId]);

  return {
    open,
    documentName,
    dismiss,
    requestConfirm,
    confirmLoss,
  };
}
