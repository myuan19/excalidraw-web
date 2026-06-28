import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("EditorTabCacheHost source contract", () => {
  it("delegates file panes to EditorPaneStack", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "EditorTabCacheHost.tsx"),
      "utf8",
    );

    expect(source).toContain("EditorPaneStack");
    expect(source).not.toContain("CachedFileEditorPane");
  });
});
