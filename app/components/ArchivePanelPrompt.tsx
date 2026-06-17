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

/** 存档面板内嵌确认层（与 nb-history 面板样式一致） */
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
        : mode.type === "archive-duplicate"
          ? "存档"
          : "存档";

  const message =
    mode.type === "restore"
      ? "当前版本没有存档吗？是否需要先存档？若不存档，切换会丢失该版本。"
      : mode.type === "delete"
        ? "确认删除该存档？此操作不可恢复。"
        : mode.type === "archive-duplicate"
          ? "当前版本已存在，是否继续存档？"
          : "存档前需要保存，是否继续？";

  const confirmLabel =
    mode.type === "delete" ? (busy ? "删除中…" : "确认删除") : busy ? "处理中…" : "是";

  const confirmClassName =
    mode.type === "delete"
      ? "nb-history-action nb-history-delete"
      : "nb-history-action nb-history-archive";

  return (
    <div
      className="nb-history-overlay nb-history-overlay--prompt"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onChoice("cancel");
        }
      }}
    >
      <div
        className="nb-history-panel nb-history-panel--prompt"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="nb-history-prompt-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="nb-history-header">
          <span id="nb-history-prompt-title">{title}</span>
          <button
            type="button"
            className="nb-history-close"
            disabled={busy}
            onClick={() => onChoice("cancel")}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        <p className="nb-history-prompt-body">{message}</p>
        <div className="nb-history-prompt-actions">
          <button
            type="button"
            className="nb-history-action"
            disabled={busy}
            onClick={() => onChoice("cancel")}
          >
            取消
          </button>
          {mode.type === "restore" ? (
            <button
              type="button"
              className="nb-history-action"
              disabled={busy}
              onClick={() => onChoice("no")}
            >
              否
            </button>
          ) : null}
          <button
            type="button"
            className={confirmClassName}
            disabled={busy}
            onClick={() => onChoice("yes")}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
