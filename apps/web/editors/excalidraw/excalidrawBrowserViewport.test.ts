import type { AppState } from "@excalidraw/excalidraw/types";
import { afterEach, describe, expect, it } from "vitest";

import {
  flushExcalidrawBrowserSceneSave,
  resolveExcalidrawBrowserViewportOverlay,
  scheduleExcalidrawBrowserSceneSave,
} from "./excalidrawBrowserViewport";
import { readForkBrowserAppStateOverlay } from "../../data/forkBrowserSceneStorage";

describe("excalidrawBrowserViewport", () => {
  afterEach(() => {
    localStorage.clear();
    flushExcalidrawBrowserSceneSave();
  });

  it("clears overlay for clean local drafts", () => {
    scheduleExcalidrawBrowserSceneSave(
      "local-draft:test",
      [],
      { scrollX: 99, scrollY: 12, zoom: { value: 1 } } as AppState,
    );
    flushExcalidrawBrowserSceneSave();

    const overlay = resolveExcalidrawBrowserViewportOverlay("local-draft:test", {
      elements: [],
      appState: {},
      files: {},
    });

    expect(overlay).toBe(null);
    expect(readForkBrowserAppStateOverlay("local-draft:test")).toBe(null);
  });

  it("restores overlay for catalog files", () => {
    scheduleExcalidrawBrowserSceneSave(
      "catalog-file",
      [{ id: "a", type: "rectangle" } as never],
      { scrollX: 42, scrollY: -7, zoom: { value: 1.25 } } as AppState,
    );
    flushExcalidrawBrowserSceneSave();

    const overlay = resolveExcalidrawBrowserViewportOverlay("catalog-file", {
      elements: [{ id: "a", type: "rectangle" }],
      appState: {},
      files: {},
    });

    expect(overlay?.scrollX).toBe(42);
    expect(overlay?.scrollY).toBe(-7);
  });
});
