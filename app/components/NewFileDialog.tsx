import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PointerEvent,
} from "react";

import { editorRegistry } from "../editors";

export type OverlayDismissHandlers = {
  onPointerDown: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  onPointerCancel: () => void;
};

type NewFileDialogProps = {
  open: boolean;
  overlayDismiss: OverlayDismissHandlers;
  onClose: () => void;
  onCommit: (name: string, kind: string) => void | Promise<void>;
};

function KindIcon({ src, alt }: { src: string; alt: string }) {
  return (
    <img
      className="filelist__image-icon"
      src={src}
      alt={alt}
      width={18}
      height={18}
      draggable={false}
    />
  );
}

/**
 * 独立弹层：编辑器类型切换只更新本组件 state，避免触发整页文件列表重渲染导致选中延迟。
 */
export const NewFileDialog = memo(function NewFileDialog({
  open,
  overlayDismiss,
  onClose,
  onCommit,
}: NewFileDialogProps) {
  const creatableEditors = useMemo(() => editorRegistry.listCreatable(), []);
  const [documentKind, setDocumentKind] = useState(() =>
    editorRegistry.getDefaultKind(),
  );
  const [fileName, setFileName] = useState("未命名");

  useEffect(() => {
    if (!open) {
      return;
    }
    setDocumentKind(editorRegistry.getDefaultKind());
    setFileName("未命名");
  }, [open]);

  const selectKind = useCallback((kind: string) => {
    setDocumentKind(kind);
  }, []);

  const handleCommit = useCallback(() => {
    void onCommit(fileName.trim() || "未命名", documentKind);
  }, [documentKind, fileName, onCommit]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="filelist__detail-overlay"
      role="dialog"
      aria-modal
      {...overlayDismiss}
    >
      <div
        className="filelist__detail-card filelist__new-file-dialog"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <h2 className="filelist__detail-title">新建文件</h2>
        <p className="filelist__new-file-hint">
          选择文件类型并起个名字，稍后在列表里也可以随时重命名
        </p>
        <div
          className="filelist__new-file-kind"
          role="radiogroup"
          aria-label="文件类型"
        >
          {creatableEditors.map((plugin) => {
            const active = documentKind === plugin.kind;
            return (
              <button
                key={plugin.kind}
                type="button"
                role="radio"
                aria-checked={active}
                className={[
                  "filelist__kind-option",
                  active ? "filelist__kind-option--active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onPointerDown={(e) => {
                  if (e.button !== 0) {
                    return;
                  }
                  selectKind(plugin.kind);
                }}
                onClick={() => selectKind(plugin.kind)}
              >
                <KindIcon src={plugin.icon} alt="" />
                <span>{plugin.displayName}</span>
              </button>
            );
          })}
        </div>
        <input
          className="filelist__folder-input filelist__new-file-input"
          value={fileName}
          autoFocus
          onChange={(e) => setFileName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleCommit();
            }
            if (e.key === "Escape") {
              onClose();
            }
          }}
        />
        <div className="filelist__detail-actions filelist__new-file-actions">
          <button
            type="button"
            className="filelist__new-btn"
            onClick={handleCommit}
          >
            创建并打开
          </button>
          <button
            type="button"
            className="filelist__import-scene-btn"
            onClick={onClose}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
});
