import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("editor tab navigation source contract", () => {
  it("routes app shell open-file navigation through editor tabs", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "appShellNavigate.ts"),
      "utf8",
    );

    expect(source).toContain("openEditorFileTab");
    expect(source).toContain("activateHomeTabWithoutSnapshot");
    expect(source).not.toContain(
      "window.location.hash = editorRegistry.buildFileHash",
    );
    expect(source).not.toContain("window.location.hash = buildViewHash(target)");
  });

  it("routes file list direct opens through editor tabs", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../hooks/useFileListController.tsx"),
      "utf8",
    );

    expect(source).toContain("openEditorFileTab");
    expect(source).not.toContain("window.location.hash = hash;");
    expect(source).not.toContain(
      "window.location.hash = editorRegistry.buildFileHash(id, kind);",
    );
  });

  it("replaces draft tabs after formal save", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../hooks/useSaveNewDocumentDialog.ts"),
      "utf8",
    );

    expect(source).toContain("replaceOpenFileTabAfterSave");
    expect(source).toContain("fromFileId: draftId");
    expect(source).not.toContain(
      "window.location.hash = editorRegistry.buildFileHash(id, savedKind);",
    );
  });
});
