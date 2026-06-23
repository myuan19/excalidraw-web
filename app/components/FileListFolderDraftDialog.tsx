import { memo, type PointerEvent } from "react";

import type { StrictOverlayDismissHandlers } from "../hooks/useStrictOverlayDismiss";

import { FileListDialogFrame } from "./FileListDialogFrame";

type FileListFolderDraftDialogProps = {
  open: boolean;
  title: string;
  name: string;
  saving?: boolean;
  overlayDismiss: StrictOverlayDismissHandlers;
  onNameChange: (name: string) => void;
  onCommit: () => void | Promise<void>;
  onClose: () => void;
};

export const FileListFolderDraftDialog = memo(function FileListFolderDraftDialog({
  open,
  title,
  name,
  saving = false,
  overlayDismiss,
  onNameChange,
  onCommit,
  onClose,
}: FileListFolderDraftDialogProps) {
  return (
    <FileListDialogFrame
      open={open}
      overlayDismiss={overlayDismiss}
      cardClassName="filelist__detail-card filelist__save-dialog"
    >
      <h2 className="filelist__detail-title">{title}</h2>
      <div className="filelist__save-dialog-body">
        <input
          className="filelist__folder-input"
          value={name}
          autoFocus
          disabled={saving}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void onCommit();
            }
            if (e.key === "Escape") {
              onClose();
            }
          }}
        />
      </div>
      <div className="filelist__save-dialog-actions">
        <button
          type="button"
          className="filelist__save-dialog-btn filelist__save-dialog-btn--primary"
          disabled={saving}
          onClick={() => void onCommit()}
        >
          保存
        </button>
        <button
          type="button"
          className="filelist__save-dialog-btn filelist__save-dialog-btn--ghost"
          disabled={saving}
          onClick={onClose}
        >
          取消
        </button>
      </div>
    </FileListDialogFrame>
  );
});
