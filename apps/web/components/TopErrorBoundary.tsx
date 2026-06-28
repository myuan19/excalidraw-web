import React from "react";

import { traceUserError } from "../lib/userTrace";

interface TopErrorBoundaryState {
  hasError: boolean;
  errorRef: string;
  localStorage: string;
}

export class TopErrorBoundary extends React.Component<
  any,
  TopErrorBoundaryState
> {
  state: TopErrorBoundaryState = {
    hasError: false,
    errorRef: "",
    localStorage: "",
  };

  render() {
    return this.state.hasError ? this.errorSplash() : this.props.children;
  }

  componentDidCatch(error: Error, errorInfo: any) {
    const _localStorage: any = {};
    for (const [key, value] of Object.entries({ ...localStorage })) {
      try {
        _localStorage[key] = JSON.parse(value);
      } catch (error: any) {
        _localStorage[key] = value;
      }
    }

    const errorRef = `local-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    console.error(error, errorInfo);
    traceUserError("app", "topErrorBoundary", error, {
      errorRef,
      componentStack: errorInfo?.componentStack
        ? String(errorInfo.componentStack).split("\n").slice(0, 12).join("\n")
        : null,
      hash: window.location.hash,
    });

    this.setState(() => ({
      hasError: true,
      errorRef,
      localStorage: JSON.stringify(_localStorage),
    }));
  }

  private selectTextArea(event: React.MouseEvent<HTMLTextAreaElement>) {
    if (event.target !== document.activeElement) {
      event.preventDefault();
      (event.target as HTMLTextAreaElement).select();
    }
  }

  private async createGithubIssue() {
    let body = "";
    try {
      const templateStrFn = (
        await import(
          /* webpackChunkName: "bug-issue-template" */ "../bug-issue-template"
        )
      ).default;
      body = encodeURIComponent(templateStrFn(this.state.errorRef));
    } catch (error: any) {
      console.error(error);
    }

    window.open(
      `https://github.com/excalidraw/excalidraw/issues/new?body=${body}`,
      "_blank",
      "noopener noreferrer",
    );
  }

  private errorSplash() {
    return (
      <div className="ErrorSplash excalidraw">
        <div className="ErrorSplash-messageContainer">
          <div className="ErrorSplash-paragraph bigger align-center">
            页面发生错误，请{" "}
            <button onClick={() => window.location.reload()}>刷新页面</button>
            {" "}重试。
          </div>
          <div className="ErrorSplash-paragraph align-center">
            如果刷新无法解决，请{" "}
            <button
              onClick={() => {
                try {
                  localStorage.clear();
                  window.location.reload();
                } catch (error: any) {
                  console.error(error);
                }
              }}
            >
              清除本地缓存并重新加载
            </button>
            <br />
            <div className="smaller">
              <span role="img" aria-label="warning">
                ⚠️
              </span>
              注意：清除缓存会丢失所有本地未保存的内容
              <span role="img" aria-hidden="true">
                ⚠️
              </span>
            </div>
          </div>
          <div>
            <div className="ErrorSplash-paragraph">
              错误已记录，参考 ID：{this.state.errorRef}
            </div>
            <div className="ErrorSplash-paragraph">
              <button onClick={() => this.createGithubIssue()}>
                提交 Bug 报告
              </button>
            </div>
            <div className="ErrorSplash-paragraph">
              <div className="ErrorSplash-details">
                <label>场景数据</label>
                <textarea
                  rows={5}
                  onPointerDown={this.selectTextArea}
                  readOnly={true}
                  value={this.state.localStorage}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
