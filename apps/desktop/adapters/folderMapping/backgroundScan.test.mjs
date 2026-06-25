import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const scanCatalogAsync = vi.fn(async (sidecar, meta) => ({
  ...meta,
  folders: meta.folders ?? [],
  files: meta.files ?? [],
}));

vi.mock("./asyncScan.js", () => ({
  scanCatalogAsync: (...args) => scanCatalogAsync(...args),
}));

vi.mock("./desktopFilesLog.mjs", () => ({
  logFilesOperation: vi.fn(),
}));

const { createCatalogBackgroundScanner } = await import("./backgroundScan.js");

function createTestSidecar() {
  const meta = {
    mapping_roots: [{ id: "root-1", absPath: "/mapped", mountFolderId: "m1" }],
    folders: [],
    files: [],
  };
  return {
    load: () => meta,
    save: vi.fn(),
  };
}

describe("createCatalogBackgroundScanner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    scanCatalogAsync.mockClear();
    scanCatalogAsync.mockImplementation(async (sidecar, meta) => ({
      ...meta,
      folders: meta.folders ?? [],
      files: meta.files ?? [],
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces watcher rescans until the quiet window elapses", async () => {
    const scanner = createCatalogBackgroundScanner({
      sidecar: createTestSidecar(),
      onUpdated: vi.fn(),
    });

    scanner.schedule({ source: "watcher", path: "a.excalidraw" });
    scanner.schedule({ source: "watcher", path: "b.excalidraw" });

    expect(scanCatalogAsync).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2999);
    expect(scanCatalogAsync).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();
    await Promise.resolve();

    expect(scanCatalogAsync).toHaveBeenCalledTimes(1);
  });

  it("does not cancel an in-flight scan when watcher events arrive", async () => {
    let resolveScan;
    let callCount = 0;
    scanCatalogAsync.mockImplementation((_sidecar, meta) => {
      callCount += 1;
      if (callCount === 1) {
        return new Promise((resolve) => {
          resolveScan = () =>
            resolve({
              ...meta,
              folders: meta.folders ?? [],
              files: meta.files ?? [],
            });
        });
      }
      return Promise.resolve({
        ...meta,
        folders: meta.folders ?? [],
        files: meta.files ?? [],
      });
    });

    const scanner = createCatalogBackgroundScanner({
      sidecar: createTestSidecar(),
      onUpdated: vi.fn(),
    });

    scanner.schedule({ source: "router-ready" });
    await Promise.resolve();

    expect(scanCatalogAsync).toHaveBeenCalledTimes(1);

    scanner.schedule({ source: "watcher", path: "notes/x.excalidraw" });

    expect(scanner.getStatus().running).toBe(true);
    expect(scanCatalogAsync).toHaveBeenCalledTimes(1);

    resolveScan();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(scanCatalogAsync).toHaveBeenCalledTimes(2);
    expect(scanner.getStatus().state).toBe("idle");
  });

  it("starts router-ready scans immediately without debounce", async () => {
    const scanner = createCatalogBackgroundScanner({
      sidecar: createTestSidecar(),
      onUpdated: vi.fn(),
    });

    scanner.schedule({ source: "router-ready" });
    await Promise.resolve();
    await Promise.resolve();

    expect(scanCatalogAsync).toHaveBeenCalledTimes(1);
  });
});
