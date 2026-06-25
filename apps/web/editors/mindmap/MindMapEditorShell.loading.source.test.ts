import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("MindMapEditorShell loading source contract", () => {
  it("logs open phases to the console instead of rendering host loading spinners", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "MindMapEditorShell.tsx"),
      "utf8",
    );

    expect(source).toContain("logEditorOpenPhase");
    expect(source).toContain("logMindMapOpenPhase");
    expect(source).not.toContain("EditorOpenOverlay");
    expect(source).not.toContain("mindmap-editor__loading");
  });

  it("cleans up missing server files before returning to the file list", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "MindMapEditorShell.tsx"),
      "utf8",
    );

    expect(source).toContain("isServerSyncNotFoundError");
    expect(source).toContain("handleMissingServerFile");
    expect(source).toContain("FileSyncState.clearLocalCache(missingFileId)");
    expect(source).toContain("FileSyncState.clearHashStateForFile(missingFileId)");
    expect(source).toContain("LocalThumbnailCache.clear(missingFileId)");
    expect(source).toContain("removeRecentFileEntry(missingFileId)");
    expect(source).toContain("removeMissingEditorFileTab(missingFileId)");
    expect(source).toContain("MISSING_FILE_REDIRECT_MS");
    expect(source).toContain("activateHomeTabWithoutSnapshot");
  });
});
