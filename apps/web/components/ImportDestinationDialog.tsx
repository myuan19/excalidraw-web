import {
  memo,
  useCallback,
  type ChangeEvent,
  type PointerEvent,
} from "react";

import { FolderPathPicker } from "./FolderPathPicker";

import type { OverlayDismissHandlers } from "./NewFileDialog";
import { shellThemeClassName } from "../hooks/useShellTheme";

import "./fileListDialogHost.scss";

type ImportDestinationDialogProps = {
  open: boolean;
  importing: boolean;
  mappingBusy: boolean;
  files: File[];
  accept: string;
  selectedFolderId: string | null;
  showAddLocalFolder?: boolean;
  overlayDismiss: OverlayDismissHandlers;
  onSelectFolder: (folderId: string | null) => void;
  onPickFiles: (files: File[]) => void;
  onAddLocalFolder?: () => Promise<string | null>;
  onConfirm: () => void;
  onCancel: () => void;
};

function formatFileSummary(files: File[]): string {
  if (files.length === 0) {
    return "尚未选择文件";
  }
  if (files.length === 1) {
    return files[0]!.name;
  }
  return `已选 ${files.length} 个文件：${files[0]!.name} 等`;
}

export const ImportDestinationDialog = memo(function ImportDestinationDialog({
  open,
  importing,
  mappingBusy,
  files,
  accept,
  selectedFolderId,
  showAddLocalFolder = false,
  overlayDismiss,
  onSelectFolder,
  onPickFiles,
  onAddLocalFolder,
  onConfirm,
  onCancel,
}: ImportDestinationDialogProps) {
  const onFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const picked = event.target.files ? Array.from(event.target.files) : [];
      event.target.value = "";
      if (picked.length > 0) {
        onPickFiles(picked);
      }
    },
    [onPickFiles],
  );

  if (!open) {
    return null;
  }

  const busy = importing || mappingBusy;
  const canConfirm = files.length > 0 && selectedFolderId !== null && !busy;

  return (
    <div
      className={`filelist-dialog-host ${shellThemeClassName()} filelist__detail-overlay`}
      role="dialog"
      aria-modal
      aria-labelledby="import-destination-title"
      {...overlayDismiss}
    >
      <div
        className="filelist__detail-card filelist__import-dialog"
        onPointerDown={(event: PointerEvent) => event.stopPropagation()}
      >
        <h2 className="filelist__detail-title" id="import-destination-title">
          导入文件
        </h2>
        <p className="filelist__new-file-hint">
          先从本地选择要导入的文件，再指定导入到哪个文件夹。
        </p>

        <section className="filelist__import-dialog-section">
          <h3 className="filelist__folder-destination-label">选择文件</h3>
          <div className="filelist__import-dialog-file-panel">
            <label
              className={[
                "filelist__import-dialog-file-btn",
                busy ? "filelist__import-dialog-file-btn--busy" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-disabled={busy || undefined}
            >
              <span className="filelist__import-dialog-file-btn-facade">
                从本地选择文件
              </span>
              <input
                type="file"
                multiple
                accept={accept}
                className="filelist__file-input-overlay"
                disabled={busy}
                tabIndex={-1}
                onChange={onFileInputChange}
              />
            </label>
            <p
              className={[
                "filelist__import-dialog-file-summary",
                files.length === 0
                  ? "filelist__import-dialog-file-summary--empty"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {formatFileSummary(files)}
            </p>
            {files.length > 1 ? (
              <ul className="filelist__import-dialog-file-list">
                {files.map((file) => (
                  <li key={`${file.name}:${file.size}:${file.lastModified}`}>
                    {file.name}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>

        <section className="filelist__import-dialog-section">
          <h3 className="filelist__folder-destination-label">选择导入位置</h3>
          <FolderPathPicker
            selectedFolderId={selectedFolderId}
            onSelectFolder={onSelectFolder}
            showOpenLocalFolder={showAddLocalFolder}
            openLocalFolderBusy={mappingBusy}
            onOpenLocalFolder={onAddLocalFolder}
          />
        </section>

        <div className="filelist__detail-actions filelist__import-dialog-actions">
          <button
            type="button"
            className="filelist__new-btn"
            disabled={!canConfirm}
            onClick={onConfirm}
          >
            {importing ? "导入中…" : "导入"}
          </button>
          <button
            type="button"
            className="filelist__import-scene-btn"
            disabled={busy}
            onClick={onCancel}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
});
