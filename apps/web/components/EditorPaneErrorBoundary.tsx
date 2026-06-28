import React from "react";

import { traceUserError } from "../lib/userTrace";
import { closeEditorTabWithoutPrepare } from "../shell/editorTabNavigation";

type EditorPaneErrorBoundaryProps = {
  tabId: string;
  fileId8: string | null;
  kind: string | null;
  children: React.ReactNode;
};

type EditorPaneErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

/** 单 Tab 编辑器错误边界：避免整页白屏，并把堆栈写入 desktop-op.log。 */
export class EditorPaneErrorBoundary extends React.Component<
  EditorPaneErrorBoundaryProps,
  EditorPaneErrorBoundaryState
> {
  state: EditorPaneErrorBoundaryState = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: Error): EditorPaneErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || "编辑器渲染失败",
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    traceUserError("tab", "editorPane.crash", error, {
      tabId: this.props.tabId,
      fileId8: this.props.fileId8,
      kind: this.props.kind,
      componentStack: errorInfo.componentStack?.split("\n").slice(0, 10).join("\n"),
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="editor-pane-error"
          style={{
            padding: 24,
            color: "#c92a2a",
            fontFamily: "var(--nb-font-ui, system-ui, sans-serif)",
          }}
        >
          <p>此标签页渲染失败：{this.state.message}</p>
          <p style={{ color: "#64748b", fontSize: 13 }}>
            日志中搜索 <code>tab | editorPane.crash</code>
          </p>
          <button
            type="button"
            style={{
              marginTop: 12,
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #cbd5e1",
              background: "#fff",
              cursor: "pointer",
            }}
            onClick={() => {
              closeEditorTabWithoutPrepare(this.props.tabId);
            }}
          >
            关闭此标签
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
