import {
  memo,
  useCallback,
  useEffect,
  useMemo,
} from "react";

import { editorRegistry } from "../editors";
import type { EditorPlugin } from "../editors/types";
import type { StrictOverlayDismissHandlers } from "../hooks/useStrictOverlayDismiss";

import { FileListDialogFrame } from "./FileListDialogFrame";

type EditorKindDialogProps = {
  open: boolean;
  title: string;
  hint: string;
  overlayDismiss: StrictOverlayDismissHandlers;
  onClose: () => void;
  /** 点击某一类型后立即执行（无需确认按钮）。 */
  onCommit: (kind: string) => void | Promise<void>;
  /** 限定可选编辑器；默认使用可创建列表。 */
  plugins?: EditorPlugin[];
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

export const EditorKindDialog = memo(function EditorKindDialog({
  open,
  title,
  hint,
  overlayDismiss,
  onClose,
  onCommit,
  plugins: pluginsProp,
}: EditorKindDialogProps) {
  const plugins = useMemo(
    () => pluginsProp ?? editorRegistry.listCreatable(),
    [pluginsProp],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const pickKind = useCallback(
    (kind: string) => {
      void onCommit(kind);
    },
    [onCommit],
  );

  return (
    <FileListDialogFrame
      open={open}
      overlayDismiss={overlayDismiss}
      cardClassName="filelist__detail-card filelist__new-file-dialog"
    >
      <h2 className="filelist__detail-title">{title}</h2>
      <p className="filelist__new-file-hint">{hint}</p>
      <div
        className="filelist__new-file-kind"
        role="listbox"
        aria-label={title}
      >
        {plugins.map((plugin) => (
          <button
            key={plugin.kind}
            type="button"
            role="option"
            className="filelist__kind-option"
            onClick={() => pickKind(plugin.kind)}
          >
            <KindIcon src={plugin.icon} alt="" />
            <span>{plugin.displayName}</span>
          </button>
        ))}
      </div>
      <div className="filelist__save-dialog-actions">
        <button
          type="button"
          className="filelist__save-dialog-btn filelist__save-dialog-btn--ghost"
          onClick={onClose}
        >
          取消
        </button>
      </div>
    </FileListDialogFrame>
  );
});
