import { describe, expect, it, vi } from "vitest";

import { attachCatalogIpcBridge } from "./catalogIpcBridge.mjs";

describe("catalogIpcBridge", () => {
  it("forwards watcher payloads to renderer IPC", () => {
    const send = vi.fn();
    const onChange = vi.fn();
    const catalogWatcher = { onChange };
    const getWebContents = () => ({ isDestroyed: () => false, send });

    attachCatalogIpcBridge(catalogWatcher, getWebContents);

    const watcherCallback = onChange.mock.calls[0][0];
    watcherCallback({ reason: "test" });

    expect(send).toHaveBeenCalledWith("editorhub:catalog-change", {
      reason: "test",
    });
  });

  it("ignores destroyed web contents", () => {
    const send = vi.fn();
    const onChange = vi.fn();
    const catalogWatcher = { onChange };
    const getWebContents = () => ({ isDestroyed: () => true, send });

    attachCatalogIpcBridge(catalogWatcher, getWebContents);

    const watcherCallback = onChange.mock.calls[0][0];
    watcherCallback({ reason: "test" });

    expect(send).not.toHaveBeenCalled();
  });
});
