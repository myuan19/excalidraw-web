import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("EditorShell remote refresh source contract", () => {
  it("preserves viewport only for cross-tab remote refresh", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "EditorShell.tsx"),
      "utf8",
    );
    expect(source).toContain("applyRemoteExcalidrawScene");
    expect(source).toContain("preserveViewport?: boolean");
    expect(source).toContain("preserveViewport: !!opts?.preserveViewport");
    expect(source).toContain(
      "reload: () => reloadSceneFromServer({ preserveViewport: true })",
    );
    expect(source).toContain("onAfterRestore={async () => {");
    expect(source).toContain("await reloadSceneFromServer();");
  });
});
