import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Excalidraw EditorShell tab cache source contract", () => {
  it("unmounts background canvases unless the pane must keep running", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "EditorShell.tsx"),
      "utf8",
    );

    expect(source).toContain("shouldKeepEditorPaneRunningInBackground");
    expect(source).toContain("shouldMountExcalidrawCanvas");
    expect(source).toContain("resolveExcalidrawInitialDocumentData");
    expect(source).toContain("latestDocumentRef.current");
    expect(source).toContain("viewModeEnabled={!isPaneForeground}");
    expect(source).toContain("handleKeyboardGlobally={isPaneForeground}");
  });
});
