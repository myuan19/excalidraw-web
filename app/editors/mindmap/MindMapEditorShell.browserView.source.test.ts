import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("MindMapEditorShell browser viewport source contract", () => {
  it("persists MindMap viewport locally and injects it into native payloads", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "MindMapEditorShell.tsx"),
      "utf8",
    );

    expect(source).toContain("applyMindMapBrowserView");
    expect(source).toContain("saveMindMapBrowserView(fileId, event.data.payload)");
    expect(source).toContain("event.data.type === \"mindMapViewState\"");
    expect(source).toContain("event.data.type === \"saveMindMapThumbnail\"");
    expect(source).not.toContain(
      "saveMindMapBrowserViewFromData(fileId, savePayload.data)",
    );
    expect(source).toContain("toBridgePayload(data, fileId");
  });
});
