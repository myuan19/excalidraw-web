import { DEFAULT_SIDEBAR, LIBRARY_SIDEBAR_TAB } from "@excalidraw/common";
import type { AppState } from "@excalidraw/excalidraw/types";
import { afterEach, describe, expect, it } from "vitest";

import {
  readForkBrowserAppStateOverlay,
  saveForkBrowserScene,
} from "./forkBrowserSceneStorage";

describe("forkBrowserSceneStorage", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("does not persist library sidebar open state", () => {
    const appState = {
      scrollX: 120,
      scrollY: -40,
      openSidebar: { name: DEFAULT_SIDEBAR.name, tab: LIBRARY_SIDEBAR_TAB },
      defaultSidebarDockedPreference: true,
    } as AppState;

    saveForkBrowserScene("file-a", [], appState);

    const overlay = readForkBrowserAppStateOverlay("file-a");
    expect(overlay?.scrollX).toBe(120);
    expect(overlay?.scrollY).toBe(-40);
    expect(overlay?.openSidebar).toBeUndefined();
    expect(overlay?.defaultSidebarDockedPreference).toBeUndefined();

    const raw = JSON.parse(
      window.localStorage.getItem("fork-browser-scene-v1-file-a") ?? "{}",
    ) as { appState?: Record<string, unknown> };
    expect(raw.appState).not.toHaveProperty("openSidebar");
    expect(raw.appState).not.toHaveProperty(
      "defaultSidebarDockedPreference",
    );
  });
});
