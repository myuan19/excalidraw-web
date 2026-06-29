import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("library import routing source contract", () => {
  it("EditorTabCacheHost mounts a dedicated import editor when addLibrary hash is present", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "EditorTabCacheHost.tsx"),
      "utf8",
    );

    expect(source).toContain("LibraryImportEditorPane");
    expect(source).toContain("showLibraryImportEditor");
    expect(source).toContain("isAddLibraryHash");
  });

  it("EditorShell supports transient libraryImportOnly sessions", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../editors/excalidraw/EditorShell.tsx"),
      "utf8",
    );

    expect(source).toContain("libraryImportOnly");
    expect(source).toContain("createLibraryImportPlaceholderFile");
    expect(source).toContain("finishLibraryUrlImportNavigation");
    expect(source).toContain("resolveLibraryReturnUrl");
  });

  it("reconcileEditorTabsWithHash activates an excalidraw tab without rewriting addLibrary hash", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "editorTabNavigation.ts"),
      "utf8",
    );

    expect(source).toContain("isAddLibraryHash(hash)");
    expect(source).toContain('findFirstFileTabByKind(state, "excalidraw")');
  });
});
