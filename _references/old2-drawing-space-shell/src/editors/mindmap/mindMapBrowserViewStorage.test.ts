import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyMindMapBrowserView,
  readMindMapBrowserView,
  saveMindMapBrowserView,
} from "./mindMapBrowserViewStorage";
import type { MindMapDocumentData } from "./bridge";

const storedView = {
  transform: { a: 1 },
  state: { scale: 1.5, x: 20, y: 0, sx: 0, sy: 0 },
};

function installStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
}

describe("mindMapBrowserViewStorage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    installStorage();
  });

  it("stores and reads browser view per file", () => {
    saveMindMapBrowserView("file-a", storedView);

    expect(readMindMapBrowserView("file-a")).toMatchObject({
      state: { scale: 1.5, x: 20 },
    });
  });

  it("ignores invalid partial view payloads", () => {
    saveMindMapBrowserView("file-a", { scale: 1.5, x: 20 });

    expect(readMindMapBrowserView("file-a")).toBeNull();
  });

  it("applies stored view over document data", () => {
    saveMindMapBrowserView("file-a", {
      transform: { a: 1 },
      state: { scale: 2, x: 0, y: 0, sx: 0, sy: 0 },
    });
    const data = {
      root: { data: { text: "root" } },
      view: {
        transform: { a: 1 },
        state: { scale: 1, x: 0, y: 0, sx: 0, sy: 0 },
      },
    } as MindMapDocumentData;

    expect(applyMindMapBrowserView("file-a", data).view).toMatchObject({
      state: { scale: 2 },
    });
  });
});
