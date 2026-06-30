import { AppConfirmDialog } from "./AppConfirmDialog";
import { ShellDialogPortal } from "./ShellDialogPortal";

type FileListConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** File list destructive confirm — 与新建/导入弹窗共用 ShellDialogPortal + AppConfirmDialog。 */
export function FileListConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: FileListConfirmDialogProps) {
  return (
    <ShellDialogPortal open={open} onBackdropClick={busy ? undefined : onCancel}>
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
    </ShellDialogPortal>
  );
}
