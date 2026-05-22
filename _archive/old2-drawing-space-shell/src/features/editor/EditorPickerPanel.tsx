import { useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { listHomeEditors } from "@/features/home/listHomeEditors";
import { requestNewTempFile } from "@/features/files/startNewTempFile";
import { editorDebugLog } from "@/features/logging/editorDebugLog";

export function EditorPickerPanel() {
  const editors = useMemo(() => listHomeEditors(), []);

  useEffect(() => {
    editorDebugLog("EditorPickerPanel.mount", {
      editorCount: editors.length,
      editorIds: editors.map((e) => e.id),
    });
  }, [editors]);

  return (
    <div className="editor-picker">
      <div className="editor-picker-inner">
        <header className="editor-picker-header">
          <h1 className="editor-picker-title">选择编辑器</h1>
          <p className="editor-picker-desc">点击即可开始，内容先保存在浏览器，保存后同步到服务器</p>
        </header>
        <div className="editor-picker-grid">
          {editors.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="editor-picker-card"
              onClick={() => {
                editorDebugLog("EditorPickerPanel.click", {
                  editorId: entry.id,
                  fileKind: entry.fileKind,
                });
                requestNewTempFile(entry.fileKind);
              }}
            >
              <span className={cn(entry.icon, "editor-picker-card-icon text-accent")} />
              <span className="editor-picker-card-label">{entry.label}</span>
              {entry.tagline ? (
                <span className="editor-picker-card-tagline">{entry.tagline}</span>
              ) : null}
            </button>
          ))}
        </div>
        {editors.length === 0 && (
          <p className="editor-picker-empty">当前未注册可用的编辑器。</p>
        )}
      </div>
    </div>
  );
}
