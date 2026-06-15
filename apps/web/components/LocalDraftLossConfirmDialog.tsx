type LocalDraftLossConfirmDialogProps = {
  open: boolean;
  documentName: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** 临时文档放弃保存时的二次确认（与 fork-home 弹层样式一致） */
export function LocalDraftLossConfirmDialog({
  open,
  documentName,
  busy = false,
  onConfirm,
  onCancel,
}: LocalDraftLossConfirmDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fork-home-dialog-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        className="fork-home-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="local-draft-loss-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="local-draft-loss-title">放弃临时文档</h3>
        <p className="fork-home-dialog-desc">
          临时文档「{documentName}」仅保存在本机浏览器，不保存将永久丢失，确定放弃吗？
        </p>
        <div className="fork-home-dialog-actions">
          <button
            type="button"
            className="fork-home-btn fork-home-btn--danger"
            disabled={busy}
            onClick={() => void onConfirm()}
          >
            确定放弃
          </button>
          <button
            type="button"
            className="fork-home-btn fork-home-btn--primary"
            disabled={busy}
            onClick={onCancel}
          >
            取消，继续编辑
          </button>
        </div>
      </div>
    </div>
  );
}
