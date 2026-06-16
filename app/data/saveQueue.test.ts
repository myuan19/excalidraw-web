import { afterEach, describe, expect, it, vi } from "vitest";

import {
  installExecutor,
  requestSave,
  requestSaveAndWait,
  type SaveResult,
} from "./saveQueue";
import { updateAppSettings } from "./appSettings";

vi.mock("./crossTabFileSync", () => ({
  broadcastFileSaved: vi.fn(),
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
  updateAppSettings({ autoSaveEnabled: false, checkpointIntervalMin: 30 });
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
});
