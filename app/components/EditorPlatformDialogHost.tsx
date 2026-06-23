import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  completeEditorPlatformConfirm,
  peekEditorPlatformConfirmRequest,
  subscribeEditorPlatformConfirmClose,
  subscribeEditorPlatformConfirmOpen,
  type EditorPlatformConfirmRequest,
} from "../shell/editorPlatformDialog";

import { AppConfirmDialog } from "./AppConfirmDialog";

function ensureDialogRoot(): HTMLElement {
  const existing = document.getElementById("editor-platform-dialog-root");
  if (existing) {
    return existing;
  }
  throw new Error("editor-platform-dialog-root is missing");
}

/** 平台级确认弹窗宿主：与侧栏/切换提醒同级，覆盖编辑器 iframe。 */
export function EditorPlatformDialogHost() {
  const [request, setRequest] = useState<EditorPlatformConfirmRequest | null>(
    () => peekEditorPlatformConfirmRequest(),
  );
  const closeTimerRef = useRef<number | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return subscribeEditorPlatformConfirmOpen((next) => {
      clearCloseTimer();
      setRequest(next);
    });
  }, [clearCloseTimer]);

  useEffect(() => {
    return subscribeEditorPlatformConfirmClose(() => {
      clearCloseTimer();
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        if (!peekEditorPlatformConfirmRequest()) {
          setRequest(null);
        }
      }, 0);
    });
  }, [clearCloseTimer]);

  useEffect(() => clearCloseTimer, [clearCloseTimer]);

  const finish = useCallback(
    (action: "primary" | "secondary" | "cancel") => {
      completeEditorPlatformConfirm(action);
    },
    [],
  );

  if (!request) {
    return null;
  }

  const dismissOnOverlay = request.dismissOnOverlay !== false;

  return createPortal(
    <AppConfirmDialog
      open
      title={request.title}
      message={request.message}
      primaryAction={{
        label: request.primaryLabel,
        variant: request.primaryVariant ?? "primary",
        disabled: request.busy,
        onClick: () => finish("primary"),
      }}
      secondaryAction={
        request.secondaryLabel
          ? {
              label: request.secondaryLabel,
              variant: request.secondaryVariant ?? "danger",
              disabled: request.busy,
              onClick: () => finish("secondary"),
            }
          : undefined
      }
      cancelAction={
        request.cancelLabel
          ? {
              label: request.cancelLabel,
              disabled: request.busy,
              onClick: () => finish("cancel"),
            }
          : undefined
      }
      onOverlayDismiss={
        dismissOnOverlay ? () => finish("cancel") : undefined
      }
    />,
    ensureDialogRoot(),
  );
}
