import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import {
  completeEditorPlatformConfirm,
  peekEditorPlatformConfirmRequest,
  subscribeEditorPlatformConfirmClose,
  subscribeEditorPlatformConfirmOpen,
  type EditorPlatformConfirmRequest,
} from "../shell/editorPlatformDialog";
import { useEditorModalOverlayRegistration } from "../shell/editorModalOverlay";

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

  useEffect(() => {
    return subscribeEditorPlatformConfirmOpen((next) => {
      setRequest(next);
    });
  }, []);

  useEffect(() => {
    return subscribeEditorPlatformConfirmClose(() => {
      setRequest(null);
    });
  }, []);

  const finish = useCallback((action: "primary" | "secondary" | "cancel") => {
    completeEditorPlatformConfirm(action);
    setRequest(null);
  }, []);

  useEditorModalOverlayRegistration(!!request);

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
      onOverlayDismiss={dismissOnOverlay ? () => finish("cancel") : undefined}
    />,
    ensureDialogRoot(),
  );
}
