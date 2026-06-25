import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/userTrace", () => ({
  traceUserAction: vi.fn(),
  traceUserError: vi.fn(),
}));

vi.mock("../lib/devDebug", () => ({
  devDebug: vi.fn(),
}));

const confirmEditorLeaveForFile = vi.fn(async () => true);
vi.mock("../shell/editorLeaveFlow", () => ({
  confirmEditorLeaveForFile: (...args: unknown[]) =>
    confirmEditorLeaveForFile(...args),
}));

const requestEditorTabSnapshot = vi.fn(async () => ({ ok: true }));

vi.mock("./activeEditorSnapshotBridge", () => ({
  requestEditorTabSnapshot: (...args: unknown[]) =>
    requestEditorTabSnapshot(...args),
}));

import {
  prepareAllOpenEditorTabsForClose,
  prepareEditorTabForClose,
} from "./editorTabLeave";
import { listOpenFileEditorTabs } from "./editorTabForeground";

vi.mock("./editorTabForeground", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./editorTabForeground")>();
  return {
    ...actual,
    listOpenFileEditorTabs: vi.fn(actual.listOpenFileEditorTabs),
  };
});

describe("editorTabLeave", () => {
  afterEach(() => {
    vi.clearAllMocks();
    confirmEditorLeaveForFile.mockResolvedValue(true);
    requestEditorTabSnapshot.mockResolvedValue({ ok: true });
  });

  it("snapshots clean tabs then runs unified leave confirm", async () => {
    await expect(prepareEditorTabForClose("file-1")).resolves.toBe(true);
    expect(requestEditorTabSnapshot).toHaveBeenCalledWith("file-1", "tab-close");
    expect(confirmEditorLeaveForFile).toHaveBeenCalledWith(
      "file-1",
      expect.objectContaining({ kind: expect.any(String) }),
    );
  });

  it("fails when snapshot fails", async () => {
    requestEditorTabSnapshot.mockResolvedValueOnce({ ok: false });

    await expect(prepareEditorTabForClose("file-1")).resolves.toBe(false);
    expect(confirmEditorLeaveForFile).not.toHaveBeenCalled();
  });

  it("blocks close when leave confirm returns false", async () => {
    confirmEditorLeaveForFile.mockResolvedValueOnce(false);

    await expect(prepareEditorTabForClose("file-1")).resolves.toBe(false);
  });

  it("prepareAllOpenEditorTabsForClose walks every open file tab", async () => {
    vi.mocked(listOpenFileEditorTabs).mockReturnValue([
      {
        id: "file:a",
        type: "file",
        fileId: "a",
        kind: "mindmap",
        title: "A",
      },
      {
        id: "file:b",
        type: "file",
        fileId: "b",
        kind: "excalidraw",
        title: "B",
      },
    ]);

    await expect(prepareAllOpenEditorTabsForClose()).resolves.toBe(true);
    expect(requestEditorTabSnapshot).toHaveBeenCalledTimes(2);
    expect(requestEditorTabSnapshot).toHaveBeenNthCalledWith(1, "a", "tab-close");
    expect(requestEditorTabSnapshot).toHaveBeenNthCalledWith(2, "b", "tab-close");
    expect(confirmEditorLeaveForFile).toHaveBeenCalledTimes(2);
  });
});
