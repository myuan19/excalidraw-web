import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("MindMapEditorShell tab cache source contract", () => {
  it("uses unified pane lifecycle and defers native iframe until foreground", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "MindMapEditorShell.tsx"),
      "utf8",
    );
    const bridgeSource = fs.readFileSync(
      path.join(__dirname, "useMindMapHostBridge.ts"),
      "utf8",
    );

    expect(source).toContain("resolvePaneForeground");
    expect(source).toContain("useEditorPaneMountGate");
    expect(source).toContain("mountNativeFrame ? (");
    expect(bridgeSource).toContain("useEditorPaneLifecycle");
    expect(bridgeSource).toContain("onForeground");
    expect(bridgeSource).toContain("onBackground");
    expect(bridgeSource).toContain("sessionEnabled");
    expect(bridgeSource).not.toContain("EDITOR_TAB_STRIP_REORDERED");
    expect(bridgeSource).not.toContain("useEditorTabActivation");
  });
});
