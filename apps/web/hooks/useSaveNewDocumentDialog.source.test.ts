import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("useSaveNewDocumentDialog source contract", () => {
  it("uses the native save dialog for desktop drafts without a preset folder", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "useSaveNewDocumentDialog.ts"),
      "utf8",
    );

    expect(source).toContain("const resolvedFolderId = presetFolderId ?? folderId;");
    expect(source).toContain("showSaveDialog");
    expect(source).toContain("splitNativeSavePath");
    expect(source).toContain("addMappedFolderRoot({");
    expect(source).toContain("absPath: nativeTarget.folderPath");
    expect(source).toContain("ServerSync.resolveCatalogFileByPath");
    expect(source).toContain("nativeOverwriteFileRef.current = overwriteFile");
    expect(source).toContain("normalizeSaveBaseName(nativeTarget.fileName, extension)");
    expect(source).toContain("presetFolderId: getPresetFolderId");
    expect(source).toContain("shouldUseNativeSaveDialogForDraft");
    expect(source).not.toContain("ensureDefaultDataDirectoryMapped");
    expect(source).not.toContain("defaultDataDirectoryFolderId");
  });
});
