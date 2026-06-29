import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("library import routing source contract", () => {
  it("uses global background import instead of a dedicated import editor pane", () => {
    const hostSource = fs.readFileSync(
      path.join(__dirname, "EditorTabCacheHost.tsx"),
      "utf8",
    );
    const appSource = fs.readFileSync(
      path.join(__dirname, "../App.tsx"),
      "utf8",
    );

    expect(hostSource).not.toContain("LibraryImportEditorPane");
    expect(hostSource).not.toContain("showLibraryImportEditor");
    expect(appSource).toContain("useGlobalLibraryUrlImport");
    expect(appSource).not.toContain("libraryImportOnly");
  });

  it("libraryUrlImport delegates to excalidraw API when foreground editor is ready", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../data/libraryUrlImport.ts"),
      "utf8",
    );

    expect(source).toContain("importLibraryTokensViaApi");
    expect(source).toContain("LIBRARY_URL_IMPORT_REQUEST_EVENT");
    expect(source).toContain("LIBRARY_URL_IMPORT_ACK_EVENT");
    expect(source).toContain("openLibraryMenu: false");
    expect(source).toContain("awaitPendingLibrarySync");
  });

  it("EditorShell handles foreground library import requests", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../editors/excalidraw/EditorShell.tsx"),
      "utf8",
    );

    expect(source).toContain("disableUrlImport: true");
    expect(source).toContain("LIBRARY_URL_IMPORT_REQUEST_EVENT");
    expect(source).toContain("importLibraryTokensViaApi");
    expect(source).toContain("logLibraryUrlImport");
    expect(source).toContain("resolveLibraryReturnUrl");
  });

  it("reconcileEditorTabsWithHash skips when the active tab already matches hash", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "editorTabNavigation.ts"),
      "utf8",
    );

    expect(source).toContain("isAddLibraryHash(hash)");
    expect(source).toContain("already-active");
    expect(source).toContain("active.fileId === fileId");
  });
});
