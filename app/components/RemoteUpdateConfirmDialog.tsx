type RemoteUpdateConfirmDialogProps = {
  open: boolean;
  documentName: string;
  onReload: () => void;
  onKeep: () => void;
};

/** 其他页面保存了新版本、本页有未保存修改时的确认弹窗（与 fork-home 弹层样式一致） */
export function RemoteUpdateConfirmDialog({
  open,
  documentName,
  onReload,
  onKeep,
}: RemoteUpdateConfirmDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fork-home-dialog-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onKeep();
        }
      }}
    >
      <div
        className="fork-home-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="remote-update-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="remote-update-confirm-title">检测到服务器有更新</h3>
        <p className="fork-home-dialog-desc">
          「{documentName}」已在其他页面保存了新版本。当前页面有未保存的修改，加载新版本将放弃这些修改。
        </p>
        <div className="fork-home-dialog-actions">
          <button
            type="button"
            className="fork-home-btn fork-home-btn--danger"
            onClick={onReload}
          >
            加载新版本
          </button>
          <button
            type="button"
            className="fork-home-btn fork-home-btn--primary"
            onClick={onKeep}
          >
            保留当前修改
          </button>
        </div>
      </div>
    </div>
  );
}
