import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Excalidraw EditorShell loading source contract", () => {
  it("cleans up missing server files and removes the dead tab", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "EditorShell.tsx"),
      "utf8",
    );

    expect(source).toContain("isServerSyncNotFoundError");
    expect(source).toContain("handleMissingServerFile");
    expect(source).toContain("FileSyncState.clearLocalCache(missingFileId)");
    expect(source).toContain("FileSyncState.clearHashStateForFile(missingFileId)");
    expect(source).toContain("LocalThumbnailCache.clear(missingFileId)");
    expect(source).toContain("removeRecentFileEntry(missingFileId)");
    expect(source).toContain("removeMissingEditorFileTab(missingFileId)");
  });
});
