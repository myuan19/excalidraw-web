import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearMindMapHostDebugForward,
  forwardMindMapHostDebug,
  installMindMapHostDebugForward,
} from "./mindMapHostDebugForward";

describe("mindMapHostDebugForward", () => {
  afterEach(() => {
    clearMindMapHostDebugForward();
  });

  it("forwards debug payloads through postToNative", () => {
    const postToNative = vi.fn(() => true);
    installMindMapHostDebugForward(postToNative);

    forwardMindMapHostDebug("mindmap-persist", "test", { fileId8: "abcd1234" });

    expect(postToNative).toHaveBeenCalledWith("mindMapHostDebug", {
      scope: "mindmap-persist",
      label: "test",
      data: { fileId8: "abcd1234" },
    });
  });

  it("no-ops when forward is not installed", () => {
    expect(() => {
      forwardMindMapHostDebug("mindmap-persist", "test");
    }).not.toThrow();
  });

  it("ignores nested forward while a forward is in flight", () => {
    const postToNative = vi.fn(() => {
      forwardMindMapHostDebug("mindmap-persist", "nested");
      return true;
    });
    installMindMapHostDebugForward(postToNative);

    forwardMindMapHostDebug("mindmap-persist", "outer");

    expect(postToNative).toHaveBeenCalledTimes(1);
    expect(postToNative).toHaveBeenCalledWith("mindMapHostDebug", {
      scope: "mindmap-persist",
      label: "outer",
      data: undefined,
    });
  });
});
