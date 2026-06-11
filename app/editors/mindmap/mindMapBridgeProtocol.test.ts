import { describe, expect, it } from "vitest";

import {
  classifyMindMapIframeFailure,
  isBridgeReadyPhase,
  parseIframeFailureKind,
  stampMindMapDataSourceVersion,
} from "./mindMapBridgeProtocol";
import { mindMapDataWithStrongChild } from "./mindMapHydrateDraftPolicy";

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

  describe("stampMindMapDataSourceVersion", () => {
    it("restores smmVersion on roots stripped by the persistence pipeline", () => {
      const data = mindMapDataWithStrongChild(
        "<p><strong><span>bold</span></strong></p>",
      );
      expect(
        (data.root as Record<string, unknown>).smmVersion,
      ).toBeUndefined();

      const stamped = stampMindMapDataSourceVersion(data, "0.14.0-fix.2");
      expect((stamped.root as Record<string, unknown>).smmVersion).toBe(
        "0.14.0-fix.2",
      );
      // 不可变更新：原文档不被修改
      expect(
        (data.root as Record<string, unknown>).smmVersion,
      ).toBeUndefined();
      // 树内容保持原样
      expect(stamped.root.children).toBe(data.root.children);
    });

    it("keeps an existing smmVersion untouched", () => {
      const data = mindMapDataWithStrongChild("<p><span>plain</span></p>");
      (data.root as Record<string, unknown>).smmVersion = "0.13.1";

      const stamped = stampMindMapDataSourceVersion(data, "0.14.0-fix.2");
      expect(stamped).toBe(data);
      expect((stamped.root as Record<string, unknown>).smmVersion).toBe(
        "0.13.1",
      );
    });
  });
});
