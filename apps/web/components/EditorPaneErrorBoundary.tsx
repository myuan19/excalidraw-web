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
    // traceUserError 在 release 包里只进 trace 管道，不会出现在 desktop-op.log
    // （2026-07-03 的崩溃日志只有 React 自己的 console.error 一行，拿不到堆栈）。
    // 这里显式用单字符串 console.error 落盘：主进程 webcontents-console-message
    // 会写入 desktop-op.log。主进程对单条消息截断 2000 字符，堆栈与组件栈
    // 拆成两条各自带 tabId 的记录。
    const head = `tab | editorPane.crash | tabId=${this.props.tabId} fileId8=${
      this.props.fileId8 ?? "-"
    } kind=${this.props.kind ?? "-"}`;
    const stack = (error.stack ?? "").split("\n").slice(0, 10).join("\n");
    const componentStack = (errorInfo.componentStack ?? "")
      .split("\n")
      .filter(Boolean)
      .slice(0, 8)
      .join("\n");
    console.error(`${head} | ${error.name}: ${error.message}\nstack:\n${stack}`);
    console.error(`${head} | componentStack:\n${componentStack}`);
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
