import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/userTrace", () => ({
  traceUserAction: vi.fn(),
  traceUserError: vi.fn(),
}));

const resolveForegroundEditorFileId = vi.fn(() => "foreground-file");

vi.mock("./editorTabForeground", () => ({
  resolveForegroundEditorFileId: () => resolveForegroundEditorFileId(),
  listOpenFileEditorTabs: vi.fn(() => []),
}));

import {
  registerActiveEditorSnapshotHandler,
  registerEditorTabSnapshotHandler,
  requestActiveEditorSnapshot,
  requestEditorTabSnapshot,
  resetActiveEditorSnapshotHandlerForTests,
} from "./activeEditorSnapshotBridge";

describe("activeEditorSnapshotBridge", () => {
  afterEach(() => {
    resetActiveEditorSnapshotHandlerForTests();
    resolveForegroundEditorFileId.mockReturnValue("foreground-file");
  });

  it("returns ok when no editor tab handler is registered", async () => {
    await expect(
      requestEditorTabSnapshot("missing-file", "tab-switch"),
    ).resolves.toEqual({
      ok: true,
      reason: "no-handler",
    });
  });

  it("delegates snapshot requests to the per-file handler", async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    registerEditorTabSnapshotHandler("file-1", handler);

    await expect(
      requestEditorTabSnapshot("file-1", "tab-close"),
    ).resolves.toEqual({
      ok: true,
    });
    expect(handler).toHaveBeenCalledWith("tab-close");
  });

  it("unregisters only the handler that registered the cleanup", async () => {
    const first = vi.fn(async () => ({ ok: true, reason: "first" }));
    const second = vi.fn(async () => ({ ok: true, reason: "second" }));
    const unregisterFirst = registerEditorTabSnapshotHandler("file-1", first);
    registerEditorTabSnapshotHandler("file-1", second);

    unregisterFirst();

    await expect(
      requestEditorTabSnapshot("file-1", "tab-switch"),
    ).resolves.toEqual({
      ok: true,
      reason: "second",
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it("converts handler exceptions into a failed snapshot result", async () => {
    registerEditorTabSnapshotHandler("file-1", async () => {
      throw new Error("boom");
    });

    await expect(
      requestEditorTabSnapshot("file-1", "tab-switch"),
    ).resolves.toEqual({
      ok: false,
      reason: "boom",
    });
  });

  it("requestActiveEditorSnapshot uses the foreground file id", async () => {
    const handler = vi.fn(async () => ({ ok: true, reason: "fg" }));
    registerEditorTabSnapshotHandler("foreground-file", handler);

    await expect(requestActiveEditorSnapshot("tab-close")).resolves.toEqual({
      ok: true,
      reason: "fg",
    });
    expect(handler).toHaveBeenCalledWith("tab-close");
  });

  it("returns no-active-editor when foreground file id is missing", async () => {
    resolveForegroundEditorFileId.mockReturnValue(null);

    await expect(requestActiveEditorSnapshot("tab-switch")).resolves.toEqual({
      ok: true,
      reason: "no-active-editor",
    });
  });

  it("registerActiveEditorSnapshotHandler delegates to foreground file id", async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    registerActiveEditorSnapshotHandler(handler);

    await expect(requestActiveEditorSnapshot("tab-switch")).resolves.toEqual({
      ok: true,
    });
    expect(handler).toHaveBeenCalledWith("tab-switch");
  });
});
