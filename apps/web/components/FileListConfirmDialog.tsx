import { createPortal } from "react-dom";

import { AppConfirmDialog } from "./AppConfirmDialog";
import { ShellDialogOverlay } from "./ShellDialogOverlay";

type FileListConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** File list destructive confirm — 与新建/导入弹窗共用 ShellDialogOverlay。 */
export function FileListConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: FileListConfirmDialogProps) {
  if (!open) {
    return null;
  }

  return createPortal(
    <ShellDialogOverlay
      onBackdropClick={busy ? undefined : onCancel}
    >
      <AppConfirmDialog
        open={open}
        overlay={false}
        title={title}
        message={message}
        dialogId="filelist-confirm-dialog"
        primaryAction={{
          label: "取消",
          variant: "primary",
          disabled: busy,
          onClick: onCancel,
        }}
        secondaryAction={{
          label: busy ? "处理中…" : confirmLabel,
          variant: "danger",
          disabled: busy,
          onClick: onConfirm,
        }}
      />
    </ShellDialogOverlay>,
    document.body,
  );
}
