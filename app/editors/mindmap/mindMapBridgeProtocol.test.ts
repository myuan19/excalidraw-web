import { describe, expect, it } from "vitest";

import {
  classifyMindMapIframeFailure,
  isBridgeReadyPhase,
  parseIframeFailureKind,
} from "./mindMapBridgeProtocol";

describe("mindMapBridgeProtocol", () => {
  it("classifies static deploy failures by kind, not message regex", () => {
    const result = classifyMindMapIframeFailure({
      kind: "script",
      message: "MindMap 脚本加载失败: https://example/dist/js/app.js",
    });
    expect(result.recoverable).toBe(false);
    expect(result.userMessage).toContain("/mind-map/dist/js/");
  });

  it("classifies chunk load as recoverable", () => {
    const result = classifyMindMapIframeFailure({
      kind: "unhandledrejection",
      message: "Loading chunk abc failed",
    });
    expect(result.kind).toBe("chunk-load");
    expect(result.recoverable).toBe(true);
  });

  it("bridge ready phases exclude mounting", () => {
    expect(isBridgeReadyPhase("mounting")).toBe(false);
    expect(isBridgeReadyPhase("bridge_ready")).toBe(true);
    expect(parseIframeFailureKind({ kind: "runtime-blocked" })).toBe(
      "runtime-blocked",
    );
  });
});
