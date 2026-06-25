import { describe, expect, it } from "vitest";

import {
  buildCatalogThumbnailSvg,
  validateCatalogDocument,
} from "./catalogDocument.js";

describe("catalogDocument", () => {
  it("accepts excalidraw documents", () => {
    const result = validateCatalogDocument(
      JSON.stringify({
        type: "excalidraw",
        elements: [{ id: "a", x: 0, y: 0, width: 10, height: 10 }],
        appState: {},
        files: {},
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.kind).toBe("excalidraw");
    }
  });

  it("accepts mindmap documents", () => {
    const result = validateCatalogDocument(
      JSON.stringify({
        root: { data: { text: "Root" }, children: [] },
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.kind).toBe("mindmap");
    }
  });

  it("marks invalid json as corrupt", () => {
    const result = validateCatalogDocument("{not-json");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("invalid_json");
    }
  });

  it("marks unrelated json as corrupt", () => {
    const result = validateCatalogDocument(JSON.stringify({ hello: "world" }));
    expect(result.ok).toBe(false);
  });

  it("does not build schematic thumbnails for mindmap documents", () => {
    const mindmapSvg = buildCatalogThumbnailSvg("mindmap", {
      root: { data: { text: "Root" }, children: [] },
    });
    expect(mindmapSvg).toBeNull();

    const excalSvg = buildCatalogThumbnailSvg("excalidraw", {
      type: "excalidraw",
      elements: [{ id: "a", x: 1, y: 2, width: 8, height: 8 }],
      appState: { viewBackgroundColor: "#ffffff" },
      files: {},
    });
    expect(excalSvg).toContain("<svg");
    expect(excalSvg).toContain('data-excal-filelist-thumb="1"');
  });
});
