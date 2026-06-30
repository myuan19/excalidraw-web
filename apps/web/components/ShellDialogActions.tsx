export type ShellDialogActionSpec = {
  label: string;
  variant?: "primary" | "danger";
  disabled?: boolean;
  onClick: () => void;
};

type ShellDialogActionsProps = {
  primary: ShellDialogActionSpec;
  secondary?: ShellDialogActionSpec;
  className?: string;
};

/**
 * 外壳弹窗底部操作区 — 复用 AppConfirmDialog 的 token 化按钮样式，
 * 避免 filelist__new-btn / filelist__import-scene-btn 混用 border 与 box-shadow。
 */
export function ShellDialogActions({
  primary,
  secondary,
  className,
}: ShellDialogActionsProps) {
  return (
    <div
      className={["app-confirm-dialog__actions", className]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        className={`app-confirm-dialog__btn app-confirm-dialog__btn--${
          primary.variant ?? "primary"
        }`}
        disabled={primary.disabled}
        onClick={primary.onClick}
      >
        {primary.label}
      </button>
      {secondary ? (
        <button
          type="button"
          className={`app-confirm-dialog__btn app-confirm-dialog__btn--${
            secondary.variant ?? "primary"
          }`}
          disabled={secondary.disabled}
          onClick={secondary.onClick}
        >
          {secondary.label}
        </button>
      ) : null}
    </div>
  );
}
