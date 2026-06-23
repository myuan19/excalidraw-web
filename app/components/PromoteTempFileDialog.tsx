import {
  memo,
  useCallback,
  useEffect,
  useState,
} from "react";

import { FolderPathPicker } from "./FolderPathPicker";
import type { StrictOverlayDismissHandlers } from "../hooks/useStrictOverlayDismiss";

import { FileListDialogFrame } from "./FileListDialogFrame";

import "./FileList.scss";

type SaveNewDocumentDialogProps = {
  open: boolean;
  saving: boolean;
  overlayDismiss: StrictOverlayDismissHandlers;
  defaultName: string;
  /** 已在「所有文件」中选定文件夹时固定路径，不再展示目录树。 */
  presetFolderId?: string | null;
  title?: string;
  hint?: string;
  onClose: () => void;
  onSave: (name: string, folderId: string | null) => void | Promise<void>;
};

export const SaveNewDocumentDialog = memo(function SaveNewDocumentDialog({
  open,
  saving,
  overlayDismiss,
  defaultName,
  presetFolderId,
  title = "保存到「所有文件」",
  hint,
  onClose,
  onSave,
}: SaveNewDocumentDialogProps) {
  const [name, setName] = useState(defaultName);
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null);
  const folderLocked = presetFolderId !== undefined;

  useEffect(() => {
    if (!open) {
      return;
    }
    setName(defaultName);
    setTargetFolderId(
      folderLocked ? (presetFolderId ?? null) : null,
    );
  }, [defaultName, folderLocked, open, presetFolderId]);

  const handleSave = useCallback(() => {
    const folderId = folderLocked ? (presetFolderId ?? null) : targetFolderId;
    void onSave(name.trim() || defaultName || "未命名", folderId);
  }, [
    defaultName,
    folderLocked,
    name,
    onSave,
    presetFolderId,
    targetFolderId,
  ]);

  return (
    <FileListDialogFrame
      open={open}
      overlayDismiss={overlayDismiss}
      cardClassName="filelist__detail-card filelist__save-dialog"
    >
      <h2 className="filelist__detail-title">{title}</h2>
      <p className="filelist__new-file-hint">
        {hint ??
          (folderLocked
            ? "为文件命名后保存到当前文件夹。"
            : "为文件命名并选择保存位置，保存后将出现在所有文件中。")}
      </p>
      <div className="filelist__save-dialog-body">
        <input
          className="filelist__folder-input"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSave();
            }
            if (e.key === "Escape") {
              onClose();
            }
          }}
        />
        <FolderPathPicker
          selectedFolderId={targetFolderId}
          onSelectFolder={setTargetFolderId}
          hidePicker={folderLocked}
        />
      </div>
      <div className="filelist__save-dialog-actions">
        <button
          type="button"
          className="filelist__save-dialog-btn filelist__save-dialog-btn--primary"
          disabled={saving}
          onClick={handleSave}
        >
          {saving ? "保存中…" : "保存"}
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
