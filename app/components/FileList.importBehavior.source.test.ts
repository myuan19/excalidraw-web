import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("FileList import behavior source contract", () => {
  it("does not auto-open MindMap files after import", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../hooks/useFileListController.tsx"),
      "utf8",
    );
    const importBranch = source.slice(
      source.indexOf("const importDocumentFiles = useCallback"),
      source.indexOf("const onSceneImportInputChange"),
    );

    expect(importBranch).not.toContain("lastImportedMindMapId");
    expect(importBranch).not.toContain("onOpenFile({");
    expect(importBranch).toContain(
      "await refresh({ silent: true, noErrorOnFailure: true })",
    );
  });
});
