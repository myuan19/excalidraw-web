import { AppConfirmDialog } from "./AppConfirmDialog";

export type ArchivePanelPromptChoice = "yes" | "no" | "cancel";

export type ArchivePanelPromptMode =
  | { type: "restore"; archiveId: string }
  | { type: "archive-save" }
  | { type: "archive-duplicate" }
  | { type: "delete"; archiveId: string };

type ArchivePanelPromptProps = {
  mode: ArchivePanelPromptMode | null;
  busy?: boolean;
  onChoice: (choice: ArchivePanelPromptChoice) => void;
};

/** 存档面板确认层 — 复用 AppConfirmDialog，与离开编辑器等平台确认框同一套样式。 */
export function ArchivePanelPrompt({
  mode,
  busy = false,
  onChoice,
}: ArchivePanelPromptProps) {
  if (!mode) {
    return null;
  }

  const title =
    mode.type === "restore"
      ? "恢复存档"
      : mode.type === "delete"
        ? "删除存档"
        : "存档";

  const message =
    mode.type === "restore"
      ? "当前版本没有存档吗？是否需要先存档？若不存档，切换会丢失该版本。"
      : mode.type === "delete"
        ? "确认删除该存档？此操作不可恢复。"
        : mode.type === "archive-duplicate"
          ? "当前版本已存在，是否继续存档？"
          : "存档前需要保存，是否继续？";

  const isDelete = mode.type === "delete";
  const primaryLabel = isDelete
    ? busy
      ? "删除中…"
      : "确认删除"
    : busy
      ? "处理中…"
      : "是";

  return (
    <AppConfirmDialog
      open
      title={title}
      message={message}
      overlayClassName="app-confirm-dialog-overlay--stacked"
      primaryAction={{
        label: primaryLabel,
        variant: isDelete ? "danger" : "primary",
        disabled: busy,
        onClick: () => onChoice("yes"),
      }}
      secondaryAction={
        mode.type === "restore"
          ? {
              label: "否",
              variant: "danger",
              disabled: busy,
              onClick: () => onChoice("no"),
            }
          : undefined
      }
      cancelAction={{
        label: "取消",
        disabled: busy,
        onClick: () => onChoice("cancel"),
      }}
      onOverlayDismiss={busy ? undefined : () => onChoice("cancel")}
      dialogId="nb-history-prompt"
    />
  );
}
