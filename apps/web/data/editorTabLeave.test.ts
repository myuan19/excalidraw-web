import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/userTrace", () => ({
  traceUserAction: vi.fn(),
  traceUserError: vi.fn(),
}));

vi.mock("../lib/devDebug", () => ({
  devDebug: vi.fn(),
}));

const confirmEditorLeaveForFile = vi.fn(
  async (_fileId: string, _opts?: { kind?: string | null }) => true,
);
vi.mock("../shell/editorLeaveFlow", () => ({
  confirmEditorLeaveForFile: (
    fileId: string,
    opts?: { kind?: string | null },
  ) => confirmEditorLeaveForFile(fileId, opts),
}));

const requestEditorTabSnapshot = vi.fn(
  async (
    _fileId: string,
    _source: string,
  ): Promise<{ ok: boolean; reason?: string }> => ({ ok: true }),
);

const requestEditorTabSave = vi.fn(async () => true);
vi.mock("./activeEditorSaveBridge", () => ({
  requestEditorTabSave: (fileId: string, source: string) =>
    requestEditorTabSave(fileId, source),
}));

vi.mock("./activeEditorSnapshotBridge", () => ({
  requestEditorTabSnapshot: (fileId: string, source: string) =>
    requestEditorTabSnapshot(fileId, source),
}));

vi.mock("../lib/runtimePlatform", () => ({
  isDesktopEditorHub: () => true,
}));

const persistEditorTabsSnapshot = vi.fn(() => ({
  activeTabId: "home",
  tabs: [],
}));
vi.mock("../shell/editorTabs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../shell/editorTabs")>();
  return {
    ...actual,
    persistEditorTabsSnapshot: () => persistEditorTabsSnapshot(),
  };
});

import {
  prepareAllOpenEditorTabsForClose,
  prepareDesktopWindowClose,
  prepareEditorTabForClose,
} from "./editorTabLeave";
import { listOpenFileEditorTabs } from "./editorTabForeground";
import { FileSyncState } from "./FileSyncState";
import type { FileEditorTab } from "../shell/editorTabs";

vi.mock("./editorTabForeground", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./editorTabForeground")>();
  return {
    ...actual,
    listOpenFileEditorTabs: vi.fn(actual.listOpenFileEditorTabs),
  };
});

function makeFileTab(
  fileId: string,
  kind: string,
  stackOrder: number,
): FileEditorTab {
  return {
    id: `file:${fileId}`,
    type: "file",
    fileId,
    kind,
    title: fileId.toUpperCase(),
    lastActiveAt: new Date(0).toISOString(),
    stackOrder,
  };
}

describe("editorTabLeave", () => {
  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    confirmEditorLeaveForFile.mockResolvedValue(true);
    requestEditorTabSnapshot.mockResolvedValue({ ok: true });
  });

  it("skips snapshot and confirm for clean tabs", async () => {
    await expect(prepareEditorTabForClose("file-1")).resolves.toBe(true);
    expect(requestEditorTabSnapshot).not.toHaveBeenCalled();
    expect(confirmEditorLeaveForFile).not.toHaveBeenCalled();
  });

  it("snapshots dirty tabs then runs unified leave confirm", async () => {
    FileSyncState.setBaselineHash("file-1", "baseline");
    FileSyncState.setDraftHash("file-1", "draft");

    await expect(prepareEditorTabForClose("file-1")).resolves.toBe(true);
    expect(requestEditorTabSnapshot).toHaveBeenCalledWith(
      "file-1",
      "tab-close",
    );
    expect(confirmEditorLeaveForFile).toHaveBeenCalledWith(
      "file-1",
      expect.objectContaining({ kind: expect.any(String) }),
    );
  });

  it("fails when snapshot fails for tab-switch", async () => {
    FileSyncState.setBaselineHash("file-1", "baseline");
    FileSyncState.setDraftHash("file-1", "draft");
    requestEditorTabSnapshot.mockResolvedValueOnce({ ok: false });

    await expect(
      prepareEditorTabForClose("file-1", "tab-switch"),
    ).resolves.toBe(false);
    expect(confirmEditorLeaveForFile).not.toHaveBeenCalled();
  });

  it("continues when snapshot fails for tab-close by default", async () => {
    FileSyncState.setBaselineHash("file-1", "baseline");
    FileSyncState.setDraftHash("file-1", "draft");
    requestEditorTabSnapshot.mockResolvedValueOnce({
      ok: false,
      reason: "timeout",
    });

    await expect(prepareEditorTabForClose("file-1", "tab-close")).resolves.toBe(
      true,
    );
    expect(confirmEditorLeaveForFile).toHaveBeenCalledWith(
      "file-1",
      expect.objectContaining({ kind: expect.any(String) }),
    );
  });

  it("prepareAllOpenEditorTabsForClose continues when snapshot fails", async () => {
    FileSyncState.setBaselineHash("a", "baseline");
    FileSyncState.setDraftHash("a", "draft");
    requestEditorTabSnapshot.mockResolvedValueOnce({
      ok: false,
      reason: "timeout",
    });
    vi.mocked(listOpenFileEditorTabs).mockReturnValue([
      makeFileTab("a", "mindmap", 1),
    ]);

    await expect(prepareAllOpenEditorTabsForClose()).resolves.toBe(true);
    expect(confirmEditorLeaveForFile).toHaveBeenCalledWith(
      "a",
      expect.objectContaining({ kind: expect.any(String) }),
    );
  });

  it("blocks close when leave confirm returns false", async () => {
    FileSyncState.setBaselineHash("file-1", "baseline");
    FileSyncState.setDraftHash("file-1", "draft");
    confirmEditorLeaveForFile.mockResolvedValueOnce(false);

    await expect(prepareEditorTabForClose("file-1")).resolves.toBe(false);
  });

  it("prepareAllOpenEditorTabsForClose walks every open file tab", async () => {
    FileSyncState.setBaselineHash("a", "baseline");
    FileSyncState.setDraftHash("a", "draft");
    FileSyncState.setBaselineHash("b", "baseline");
    FileSyncState.setDraftHash("b", "draft");
    vi.mocked(listOpenFileEditorTabs).mockReturnValue([
      makeFileTab("a", "mindmap", 1),
      makeFileTab("b", "excalidraw", 2),
    ]);

    await expect(prepareAllOpenEditorTabsForClose()).resolves.toBe(true);
    expect(requestEditorTabSnapshot).toHaveBeenCalledTimes(2);
    expect(requestEditorTabSnapshot).toHaveBeenNthCalledWith(
      1,
      "a",
      "tab-close",
    );
    expect(requestEditorTabSnapshot).toHaveBeenNthCalledWith(
      2,
      "b",
      "tab-close",
    );
    expect(confirmEditorLeaveForFile).toHaveBeenCalledTimes(2);
  });

  it("prepareDesktopWindowClose auto-saves dirty tabs in parallel without snapshot", async () => {
    FileSyncState.setBaselineHash("a", "baseline");
    FileSyncState.setDraftHash("a", "draft");
    FileSyncState.setBaselineHash("b", "baseline");
    FileSyncState.setDraftHash("b", "draft");
    vi.mocked(listOpenFileEditorTabs).mockReturnValue([
      makeFileTab("a", "mindmap", 1),
      makeFileTab("b", "excalidraw", 2),
    ]);

    await expect(prepareDesktopWindowClose()).resolves.toBe(true);
    expect(requestEditorTabSnapshot).not.toHaveBeenCalled();
    expect(confirmEditorLeaveForFile).not.toHaveBeenCalled();
    expect(requestEditorTabSave).toHaveBeenCalledTimes(2);
    expect(requestEditorTabSave).toHaveBeenCalledWith("a", "exit");
    expect(requestEditorTabSave).toHaveBeenCalledWith("b", "exit");
    expect(persistEditorTabsSnapshot).toHaveBeenCalled();
  });
});
