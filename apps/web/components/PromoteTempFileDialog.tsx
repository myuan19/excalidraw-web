import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";

import { FolderPathPicker } from "./FolderPathPicker";

import {
  ServerSync,
  type FileTreeResponse,
  type ServerFolder,
} from "../data/ServerSync";
import type { OverlayDismissHandlers } from "./NewFileDialog";
import { shellThemeClassName } from "../hooks/useShellTheme";
import { useEditorModalOverlayRegistration } from "../shell/editorModalOverlay";
import {
  hasSaveNameConflict,
  normalizeSaveBaseName,
  saveExtensionForKind,
  type DiskFolderPickResult,
} from "./saveDialogUtils";

import "./fileListDialogHost.scss";

const LOCAL_FOLDER_ICON =
  "M21 2H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7l-2 3v1h8v-1l-2-3h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 12H3V4h18v10z";

function SaveDialogIcon({
  d,
  size = 16,
}: {
  d: string;
  size?: number;
}) {
  return (
    <svg
      className="filelist__tree-row-icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
    >
      <path fill="currentColor" d={d} />
    </svg>
  );
}

type SaveNewDocumentDialogProps = {
  open: boolean;
  saving: boolean;
  overlayDismiss: OverlayDismissHandlers;
  defaultName: string;
  documentKind?: string;
  /** 已在具体文件夹中创建时固定路径，不再展示目录树。 */
  presetFolderId?: string;
  title?: string;
  hint?: string;
  allowOpenLocalFolder?: boolean;
  openLocalFolderBusy?: boolean;
  onOpenLocalFolder?: () => Promise<DiskFolderPickResult | null>;
  onClose: () => void;
  onSave: (name: string, folderId: string | null) => void | Promise<void>;
};

function stripExtension(name: string, extension: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "";
  }
  const lower = trimmed.toLowerCase();
  const extLower = extension.toLowerCase();
  if (lower.endsWith(extLower)) {
    return trimmed.slice(0, trimmed.length - extension.length);
  }
  return trimmed;
}

type SaveDestination = {
  type: "disk" | "catalog";
  folderId: string;
  label: string;
};

function getFolderPathLabel(
  folders: ServerFolder[],
  folderId: string | null,
): string | null {
  if (!folderId) {
    return null;
  }
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const parts: string[] = [];
  let current = byId.get(folderId) ?? null;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    parts.unshift(current.name);
    current = current.parent_id ? byId.get(current.parent_id) ?? null : null;
  }
  return parts.length > 0 ? parts.join(" / ") : null;
}

export const SaveNewDocumentDialog = memo(function SaveNewDocumentDialog({
  open,
  saving,
  overlayDismiss,
  defaultName,
  documentKind = "excalidraw",
  presetFolderId,
  title = "选择保存位置",
  hint,
  allowOpenLocalFolder = false,
  openLocalFolderBusy = false,
  onOpenLocalFolder,
  onClose,
  onSave,
}: SaveNewDocumentDialogProps) {
  const extension = saveExtensionForKind(documentKind);
  const baseDefaultName = stripExtension(defaultName, extension);

  const [step, setStep] = useState<"destination" | "name">("destination");
  const [saveName, setSaveName] = useState(baseDefaultName);
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null);
  const [selectedDestination, setSelectedDestination] =
    useState<SaveDestination | null>(null);
  const [fileTree, setFileTree] = useState<FileTreeResponse | null>(null);
  const folderLocked = typeof presetFolderId === "string" && presetFolderId.length > 0;
  const busy = saving || openLocalFolderBusy;

  useEditorModalOverlayRegistration(open);

  const refreshFileTree = useCallback(async () => {
    const tree = await ServerSync.listFileTree();
    setFileTree(tree);
    return tree;
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const base = stripExtension(defaultName, extension);
    setSaveName(base);
    setTargetFolderId(folderLocked ? presetFolderId : null);
    setStep(folderLocked ? "name" : "destination");
    setSelectedDestination(
      folderLocked && presetFolderId
        ? { type: "catalog", folderId: presetFolderId, label: "当前文件夹" }
        : null,
    );
    void refreshFileTree().catch(() => setFileTree(null));
  }, [
    defaultName,
    extension,
    folderLocked,
    open,
    presetFolderId,
    refreshFileTree,
  ]);


  const trimmedSaveName = saveName.trim();
  const normalizedSaveName = normalizeSaveBaseName(saveName, extension);
  const selectedFolderId = selectedDestination?.folderId ?? null;
  const duplicateName = hasSaveNameConflict({
    files: fileTree?.files ?? [],
    folderId: selectedFolderId,
    documentKind,
    name: saveName,
  });
  const validationMessage =
    trimmedSaveName.length === 0
      ? "请输入文件名称"
      : !fileTree
      ? "正在检查文件名…"
      : duplicateName
      ? "该文件夹中已存在同名文件"
      : null;
  const canSave =
    !!selectedDestination &&
    !!fileTree &&
    trimmedSaveName.length > 0 &&
    !duplicateName;

  const handlePickDiskDestination = useCallback(async () => {
    if (!allowOpenLocalFolder || !onOpenLocalFolder || busy) {
      return;
    }
    const picked = await onOpenLocalFolder();
    if (!picked) {
      return;
    }
    const tree = await refreshFileTree().catch(() => null);
    setTargetFolderId(picked.folderId);
    setSelectedDestination({
      type: "disk",
      folderId: picked.folderId,
      label:
        picked.absPath ||
        getFolderPathLabel(tree?.folders ?? [], picked.folderId) ||
        "已选磁盘目录",
    });
  }, [
    allowOpenLocalFolder,
    busy,
    onOpenLocalFolder,
    refreshFileTree,
  ]);

  const handleSelectCatalogFolder = useCallback(
    (folderId: string | null) => {
      setTargetFolderId(folderId);
      if (!folderId) {
        setSelectedDestination(null);
        return;
      }
      setSelectedDestination({
        type: "catalog",
        folderId,
        label:
          getFolderPathLabel(fileTree?.folders ?? [], folderId) ?? "已选文件夹",
      });
    },
    [fileTree?.folders],
  );

  const handleChooseDestination = useCallback(() => {
    if (!selectedDestination || busy) {
      return;
    }
    setStep("name");
  }, [busy, selectedDestination]);

  const handleSave = useCallback(async () => {
    if (!canSave || !selectedDestination) {
      return;
    }
    await onSave(normalizedSaveName, selectedDestination.folderId);
  }, [canSave, normalizedSaveName, onSave, selectedDestination]);

  const handleTreeLoaded = useCallback((tree: FileTreeResponse) => {
    setFileTree(tree);
  }, []);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className={`filelist-dialog-host ${shellThemeClassName()} filelist__detail-overlay`}
      role="dialog"
      aria-modal
      {...overlayDismiss}
    >
      <div
        className="filelist__detail-card filelist__move-dialog filelist__save-dialog"
        onPointerDown={(e: PointerEvent) => e.stopPropagation()}
      >
        <h2 className="filelist__detail-title">{title}</h2>
        {hint ? <p className="filelist__new-file-hint">{hint}</p> : null}

        {folderLocked || step === "name" ? (
          <>
            <div className="filelist__save-dialog-step-header">
              <div>
                <p className="filelist__save-dialog-step-eyebrow">保存目标</p>
                <p className="filelist__save-dialog-destination-summary">
                  {selectedDestination?.type === "disk"
                    ? "电脑目录"
                    : "左侧目录"}
                  ：{selectedDestination?.label ?? "当前文件夹"}
                </p>
              </div>
              {!folderLocked ? (
                <button
                  type="button"
                  className="filelist__save-dialog-back-btn"
                  disabled={busy}
                  onClick={() => setStep("destination")}
                >
                  返回
                </button>
              ) : null}
            </div>
            <label className="filelist__save-dialog-field-label">文件名称</label>
            <div className="filelist__save-name-field">
              <input
                className="filelist__save-name-input"
                value={saveName}
                autoFocus
                aria-invalid={duplicateName || trimmedSaveName.length === 0}
                aria-describedby="save-dialog-name-validation"
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void handleSave();
                  }
                  if (e.key === "Escape") {
                    onClose();
                  }
                }}
              />
              <span className="filelist__save-name-ext">{extension}</span>
            </div>
            <p
              id="save-dialog-name-validation"
              className={[
                "filelist__save-dialog-validation",
                duplicateName || trimmedSaveName.length === 0
                  ? "filelist__save-dialog-validation--error"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {validationMessage ?? `将保存为 ${normalizedSaveName}${extension}`}
            </p>
            <div className="filelist__detail-actions filelist__save-dialog-actions">
              <button
                type="button"
                className="filelist__import-scene-btn"
                disabled={busy}
                onClick={onClose}
              >
                取消
              </button>
              <button
                type="button"
                className="filelist__new-btn"
                disabled={busy || !canSave}
                onClick={() => void handleSave()}
              >
                {saving ? "保存中…" : "保存"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="filelist__save-destination-list">
              {allowOpenLocalFolder ? (
                <button
                  type="button"
                  className={[
                    "filelist__tree-row",
                    "filelist__save-disk-row",
                    selectedDestination?.type === "disk"
                      ? "filelist__tree-row--active"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ paddingLeft: "0.35rem" }}
                  disabled={busy}
                  onClick={() => void handlePickDiskDestination()}
                >
                  <span className="filelist__tree-toggle" aria-hidden="true">
                    <span className="filelist__tree-chevron" />
                  </span>
                  <span className="filelist__tree-name">
                    <SaveDialogIcon d={LOCAL_FOLDER_ICON} />
                    <span>
                      {openLocalFolderBusy ? "正在打开…" : "打开电脑目录"}
                    </span>
                  </span>
                </button>
              ) : null}

              <section className="filelist__save-dialog-section">
                <FolderPathPicker
                  selectedFolderId={targetFolderId}
                  onSelectFolder={handleSelectCatalogFolder}
                  variant="save"
                  hideTreeSectionLabel
                  onTreeLoaded={handleTreeLoaded}
                  showOpenLocalFolder={false}
                />
                <p className="filelist__save-destination-summary">
                  已选择：{selectedDestination?.label ?? "请选择保存目录"}
                </p>
                <div className="filelist__detail-actions filelist__save-dialog-actions">
                  <button
                    type="button"
                    className="filelist__import-scene-btn"
                    disabled={busy}
                    onClick={onClose}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="filelist__new-btn"
                    disabled={busy || !selectedDestination}
                    onClick={() => handleChooseDestination()}
                  >
                    下一步
                  </button>
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
});
