import { afterEach, describe, expect, it, vi } from "vitest";

import {
  installExecutor,
  requestSave,
  requestSaveAndWait,
  type SaveResult,
} from "./saveQueue";
import { updateAppSettings } from "./appSettings";
import {
  beginRemoteUpdatePrompt,
  endRemoteUpdatePrompt,
} from "./fileSyncOperationState";

vi.mock("./crossTabFileSync", () => ({
  broadcastFileSaved: vi.fn(),
}));

vi.mock("../lib/perfLog", () => ({
  logPerf: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

let cleanup: (() => void) | null = null;

afterEach(() => {
  cleanup?.();
  cleanup = null;
  updateAppSettings({
    autoSaveEnabled: false,
    autoSaveIdleSec: 10,
    checkpointIntervalMin: 30,
  });
  vi.useRealTimers();
});

describe("saveQueue requestId idempotency", () => {
  it("ignores duplicate fire-and-forget requests while running and shortly after completion", async () => {
    const result: SaveResult = {
      saved: true,
      fileId: "file-1",
      contentSha256: "sha-1",
    };
    const pendingSave = deferred<SaveResult>();
    const executor = vi.fn(() => pendingSave.promise);
    cleanup = installExecutor(executor);

    requestSave({ source: "sidebar", requestId: "save:one-click" });
    await flushMicrotasks();
    requestSave({ source: "sidebar", requestId: "save:one-click" });
    await flushMicrotasks();

    expect(executor).toHaveBeenCalledTimes(1);

    pendingSave.resolve(result);
    await pendingSave.promise;
    await flushMicrotasks();

    requestSave({ source: "sidebar", requestId: "save:one-click" });
    await flushMicrotasks();

    expect(executor).toHaveBeenCalledTimes(1);
  });

  it("shares the running result for duplicate requestSaveAndWait calls", async () => {
    const result: SaveResult = {
      saved: true,
      fileId: "file-2",
      contentSha256: "sha-2",
    };
    const pendingSave = deferred<SaveResult>();
    const executor = vi.fn(() => pendingSave.promise);
    cleanup = installExecutor(executor);

    const first = requestSaveAndWait({
      source: "home",
      requestId: "home:confirm-save",
    });
    await flushMicrotasks();
    const second = requestSaveAndWait({
      source: "home",
      requestId: "home:confirm-save",
    });

    expect(executor).toHaveBeenCalledTimes(1);

    pendingSave.resolve(result);

    await expect(first).resolves.toEqual(result);
    await expect(second).resolves.toEqual(result);

    await expect(
      requestSaveAndWait({
        source: "home",
        requestId: "home:confirm-save",
      }),
    ).resolves.toEqual(result);
    expect(executor).toHaveBeenCalledTimes(1);
  });
});

describe("saveQueue source priority", () => {
  it("does not let thumbnail maintenance override an auto content save", async () => {
    vi.useFakeTimers();
    updateAppSettings({ autoSaveEnabled: true });
    const executor = vi.fn(async (req) => ({
      saved: true,
      fileId: "file-3",
      contentSha256: req.source,
    }));
    cleanup = installExecutor(executor);

    requestSave({ source: "auto" });
    requestSave({ source: "thumbnail", forceThumbnail: true });

    await vi.advanceTimersByTimeAsync(300);
    await flushMicrotasks();

    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "auto",
        forceThumbnail: true,
      }),
    );
  });
});

describe("saveQueue overlapping save requests", () => {
  it("merges pending auto then home into one active navigation save", async () => {
    updateAppSettings({ autoSaveEnabled: true });
    const executor = vi.fn(async (req) => ({
      saved: true,
      fileId: "file-home-pending",
      contentSha256: req.source,
    }));
    cleanup = installExecutor(executor);

    requestSave({ source: "auto" });
    const save = requestSaveAndWait({
      source: "home",
      navigateAfter: true,
    });

    await expect(save).resolves.toEqual({
      saved: true,
      fileId: "file-home-pending",
      contentSha256: "home",
    });
    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "home",
        navigateAfter: true,
        requiresFreshSnapshot: true,
      }),
    );
  });

  it("queues a home follow-up instead of reusing a running auto save", async () => {
    vi.useFakeTimers();
    updateAppSettings({ autoSaveEnabled: true });
    let dirty = true;
    const autoSave = deferred<SaveResult>();
    const homeSave = deferred<SaveResult>();
    const executor = vi.fn((req) =>
      req.source === "auto" ? autoSave.promise : homeSave.promise,
    );
    cleanup = installExecutor(executor, {
      getCurrentFileDirty: () => dirty,
    });

    requestSave({ source: "auto" });
    await vi.advanceTimersByTimeAsync(300);
    await flushMicrotasks();
    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ source: "auto" }),
    );

    const home = requestSaveAndWait({
      source: "home",
      navigateAfter: true,
    });
    await flushMicrotasks();
    expect(executor).toHaveBeenCalledTimes(1);

    autoSave.resolve({
      saved: true,
      fileId: "file-overlap",
      contentSha256: "auto",
    });
    await flushMicrotasks();
    expect(executor).toHaveBeenCalledTimes(2);
    expect(executor).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        source: "home",
        navigateAfter: true,
        requiresFreshSnapshot: true,
      }),
    );

    homeSave.resolve({
      saved: true,
      fileId: "file-overlap",
      contentSha256: "home",
    });
    await expect(home).resolves.toEqual({
      saved: true,
      fileId: "file-overlap",
      contentSha256: "home",
    });
    dirty = false;
  });

  it("skips a running-save follow-up when the latest state is already clean", async () => {
    vi.useFakeTimers();
    updateAppSettings({ autoSaveEnabled: true });
    let dirty = true;
    const autoSave = deferred<SaveResult>();
    const executor = vi.fn(() => autoSave.promise);
    cleanup = installExecutor(executor, {
      getCurrentFileDirty: () => dirty,
    });

    requestSave({ source: "auto" });
    await vi.advanceTimersByTimeAsync(300);
    await flushMicrotasks();

    const home = requestSaveAndWait({
      source: "home",
      navigateAfter: true,
    });
    dirty = false;
    autoSave.resolve({
      saved: true,
      fileId: "file-clean-followup",
      contentSha256: "auto",
    });

    await expect(home).resolves.toEqual({ saved: false, clean: true });
    expect(executor).toHaveBeenCalledTimes(1);
  });

  it("executes a running-save follow-up when the latest state is still dirty", async () => {
    vi.useFakeTimers();
    updateAppSettings({ autoSaveEnabled: true });
    const autoSave = deferred<SaveResult>();
    const followUpSave = deferred<SaveResult>();
    const executor = vi.fn((req) =>
      req.source === "auto" ? autoSave.promise : followUpSave.promise,
    );
    cleanup = installExecutor(executor, {
      getCurrentFileDirty: () => true,
    });

    requestSave({ source: "auto" });
    await vi.advanceTimersByTimeAsync(300);
    await flushMicrotasks();

    const followUp = requestSaveAndWait({
      source: "toolbar",
      requestId: "manual-after-auto",
    });
    autoSave.resolve({
      saved: true,
      fileId: "file-dirty-followup",
      contentSha256: "auto",
    });
    await flushMicrotasks();

    expect(executor).toHaveBeenCalledTimes(2);
    expect(executor).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        source: "toolbar",
        requestId: "manual-after-auto",
        requiresFreshSnapshot: true,
      }),
    );

    followUpSave.resolve({
      saved: true,
      fileId: "file-dirty-followup",
      contentSha256: "toolbar",
    });
    await expect(followUp).resolves.toEqual({
      saved: true,
      fileId: "file-dirty-followup",
      contentSha256: "toolbar",
    });
  });
});

describe("saveQueue automatic source guards", () => {
  it("ignores auto saves while auto-save is disabled", async () => {
    const executor = vi.fn(async () => ({
      saved: true,
      fileId: "file-auto-disabled",
    }));
    cleanup = installExecutor(executor);

    requestSave({ source: "auto" });
    await flushMicrotasks();

    expect(executor).not.toHaveBeenCalled();
  });

  it("ignores auto saves when idle auto-save is disabled", async () => {
    updateAppSettings({ autoSaveEnabled: true, autoSaveIdleSec: 0 });
    const executor = vi.fn(async () => ({
      saved: true,
      fileId: "file-auto-idle-disabled",
    }));
    cleanup = installExecutor(executor);

    requestSave({ source: "auto" });
    await flushMicrotasks();

    expect(executor).not.toHaveBeenCalled();
  });

  it("re-checks auto-save setting before a queued auto save drains", async () => {
    vi.useFakeTimers();
    updateAppSettings({ autoSaveEnabled: true });
    const executor = vi.fn(async () => ({
      saved: true,
      fileId: "file-auto-disabled-late",
    }));
    cleanup = installExecutor(executor);

    requestSave({ source: "auto" });
    updateAppSettings({ autoSaveEnabled: false });

    await vi.advanceTimersByTimeAsync(300);
    await flushMicrotasks();

    expect(executor).not.toHaveBeenCalled();
  });

  it("ignores thumbnail maintenance while auto-save is disabled", async () => {
    const executor = vi.fn(async () => ({
      saved: true,
      fileId: "file-thumbnail-disabled",
    }));
    cleanup = installExecutor(executor);

    requestSave({ source: "thumbnail", forceThumbnail: true });
    await flushMicrotasks();

    expect(executor).not.toHaveBeenCalled();
  });

  it("re-checks auto-save setting before a queued thumbnail save drains", async () => {
    vi.useFakeTimers();
    updateAppSettings({ autoSaveEnabled: true });
    const executor = vi.fn(async () => ({
      saved: true,
      fileId: "file-thumbnail-disabled-late",
    }));
    cleanup = installExecutor(executor);

    requestSave({ source: "thumbnail", forceThumbnail: true });
    updateAppSettings({ autoSaveEnabled: false });

    await vi.advanceTimersByTimeAsync(300);
    await flushMicrotasks();

    expect(executor).not.toHaveBeenCalled();
  });

  it("ignores removed visibility saves at the unified queue boundary", async () => {
    updateAppSettings({ autoSaveEnabled: true });
    const executor = vi.fn(async () => ({
      saved: true,
      fileId: "file-visibility",
    }));
    cleanup = installExecutor(executor);

    await expect(requestSaveAndWait({ source: "visibility" })).resolves.toEqual(
      { saved: false },
    );

    expect(executor).not.toHaveBeenCalled();
  });

  it("blocks passive saves while a remote update prompt is active", async () => {
    updateAppSettings({ autoSaveEnabled: true });
    const executor = vi.fn(async () => ({
      saved: true,
      fileId: "file-remote-op",
    }));
    cleanup = installExecutor(executor, {
      getCurrentFileId: () => "file-remote-op",
    });
    const token = beginRemoteUpdatePrompt({
      fileId: "file-remote-op",
      contentSha256: "server-sha",
      serverVersion: 12,
      source: "cross-tab",
    });

    try {
      requestSave({ source: "auto" });
      requestSave({ source: "thumbnail", forceThumbnail: true });
      await flushMicrotasks();
    } finally {
      endRemoteUpdatePrompt(token);
    }

    expect(executor).not.toHaveBeenCalled();
  });

  it("does not block manual saves while a remote update prompt is active", async () => {
    const executor = vi.fn(async () => ({
      saved: true,
      fileId: "file-remote-op",
    }));
    cleanup = installExecutor(executor, {
      getCurrentFileId: () => "file-remote-op",
    });
    const token = beginRemoteUpdatePrompt({
      fileId: "file-remote-op",
      contentSha256: "server-sha",
      serverVersion: 12,
      source: "cross-tab",
    });

    try {
      requestSave({ source: "toolbar" });
      await flushMicrotasks();
    } finally {
      endRemoteUpdatePrompt(token);
    }

    expect(executor).toHaveBeenCalledTimes(1);
  });
});
