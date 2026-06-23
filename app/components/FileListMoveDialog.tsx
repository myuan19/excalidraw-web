import { memo, type ReactNode } from "react";

import type { StrictOverlayDismissHandlers } from "../hooks/useStrictOverlayDismiss";

import { FileListDialogFrame } from "./FileListDialogFrame";

type FileListMoveDialogProps = {
  open: boolean;
  fileName: string;
  moveDisabled: boolean;
  moving?: boolean;
  overlayDismiss: StrictOverlayDismissHandlers;
  folderPicker: ReactNode;
  onCommit: () => void | Promise<void>;
  onClose: () => void;
};

export const FileListMoveDialog = memo(function FileListMoveDialog({
  open,
  fileName,
  moveDisabled,
  moving = false,
  overlayDismiss,
  folderPicker,
  onCommit,
  onClose,
}: FileListMoveDialogProps) {
  return (
    <FileListDialogFrame
      open={open}
      overlayDismiss={overlayDismiss}
      cardClassName="filelist__detail-card filelist__move-dialog"
    >
      <h2 className="filelist__detail-title">移动「{fileName}」</h2>
      <p className="filelist__new-file-hint">选择要移动到的文件夹</p>
      {folderPicker}
      <div className="filelist__save-dialog-actions">
        <button
          type="button"
          className="filelist__save-dialog-btn filelist__save-dialog-btn--primary"
          disabled={moveDisabled || moving}
          onClick={() => void onCommit()}
        >
          {moving ? "移动中…" : "移动"}
        </button>
        <button
          type="button"
          className="filelist__save-dialog-btn filelist__save-dialog-btn--ghost"
          disabled={moving}
          onClick={onClose}
        >
          取消
        </button>
      </div>
    </FileListDialogFrame>
  );
});
