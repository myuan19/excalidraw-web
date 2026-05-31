import { afterEach, describe, expect, it, vi } from "vitest";

import {
  editorOpenPhaseLabel,
  logEditorOpenPhase,
  resetEditorOpenPhaseLog,
  shouldFetchServerAfterCachedOpen,
  shouldOpenCachedDocumentFirst,
} from "./editorOpenPhases";

describe("editorOpenPhases", () => {
  afterEach(() => {
    resetEditorOpenPhaseLog();
    vi.restoreAllMocks();
  });

  it("labels checking_remote for console messages", () => {
    expect(editorOpenPhaseLabel("checking_remote")).toBe(
      "正在校验服务器版本…",
    );
  });

  it("logs open phase to console via devDebug", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logEditorOpenPhase("checking_remote", { editor: "excalidraw" });
    expect(spy).toHaveBeenCalled();
    const first = String(spy.mock.calls[0]?.[0] ?? "");
    expect(first).toContain("editor-open");
    expect(first).toContain("正在校验服务器版本");
  });

  it("matches cached open helpers used by both editors", () => {
    expect(shouldOpenCachedDocumentFirst({ hasCachedDocument: true })).toBe(
      true,
    );
    expect(
      shouldFetchServerAfterCachedOpen({
        hasUnsavedChanges: true,
        localServerHash: "a",
        remoteServerHash: "b",
      }),
    ).toBe(false);
  });
});
