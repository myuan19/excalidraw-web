import type { EditorPlatformConfirmVariant } from "../shell/editorPlatformDialog";

export type AppConfirmDialogAction = {
  label: string;
  variant?: EditorPlatformConfirmVariant;
  disabled?: boolean;
  onClick: () => void;
};

export type AppConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  primaryAction: AppConfirmDialogAction;
  secondaryAction?: AppConfirmDialogAction;
  cancelAction?: AppConfirmDialogAction;
  onOverlayDismiss?: () => void;
  dialogId?: string;
};

/** 编辑器平台级确认弹窗（挂载在 EditorPlatformShell，高于编辑器内容）。 */
export function AppConfirmDialog({
  open,
  title,
  message,
  primaryAction,
  secondaryAction,
  cancelAction,
  onOverlayDismiss,
  dialogId = "app-confirm-dialog",
}: AppConfirmDialogProps) {
  if (!open) {
    return null;
  }

  const titleId = `${dialogId}-title`;

  return (
    <div
      className="app-confirm-dialog-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onOverlayDismiss?.();
        }
      }}
    >
      <div
        className="app-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id={titleId}>{title}</h3>
        <p className="app-confirm-dialog__desc">{message}</p>
        <div className="app-confirm-dialog__actions">
          <button
            type="button"
            className={`app-confirm-dialog__btn app-confirm-dialog__btn--${
              primaryAction.variant ?? "primary"
            }`}
            disabled={primaryAction.disabled}
            onClick={primaryAction.onClick}
          >
            {primaryAction.label}
          </button>
          {secondaryAction ? (
            <button
              type="button"
              className={`app-confirm-dialog__btn app-confirm-dialog__btn--${
                secondaryAction.variant ?? "danger"
              }`}
              disabled={secondaryAction.disabled}
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </button>
          ) : null}
        </div>
        {cancelAction ? (
          <button
            type="button"
            className="app-confirm-dialog__cancel"
            disabled={cancelAction.disabled}
            onClick={cancelAction.onClick}
          >
            {cancelAction.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
