import { describe, expect, it } from "vitest";

import { pickSceneViewportAppState } from "./sceneRestore";

import type { AppState } from "@excalidraw/excalidraw/types";

describe("pickSceneViewportAppState", () => {
  it("keeps only the local viewport fields", () => {
    const zoom = { value: 1.5 } as AppState["zoom"];
    const viewport = pickSceneViewportAppState({
      scrollX: 120,
      scrollY: -80,
      zoom,
      openSidebar: { name: "library" },
    } as AppState);

    expect(viewport).toEqual({ scrollX: 120, scrollY: -80, zoom });
    expect(viewport).not.toHaveProperty("openSidebar");
  });
});
