import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("useMindMapFileSave dirty clear source contract", () => {
  it("does not clear dirty on persisted snapshot while native dirty is pending", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "useMindMapFileSave.ts"),
      "utf8",
    );
    expect(source).toContain("isMindMapNativeDirtyPending");
    expect(source).toContain(
      "!isMindMapNativeDirtyPending(fileId) &&\n        matchesMindMapPersistedSnapshot(fileId, document)",
    );
  });

  it("blocks navigate-after-save when native returns no snapshot for dirty content", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "useMindMapFileSave.ts"),
      "utf8",
    );
    const nativeEmptyBlock = source.slice(
      source.indexOf('"mindmap.save.native-empty"'),
      source.indexOf("const { document, thumbnail } = nativeSave"),
    );
    const blockLeaveHelper = source.slice(
      source.indexOf("const blockLeaveAfterNativeSnapshotFailure"),
      source.indexOf("const persistLocalDraftToCache = useCallback"),
    );

    expect(nativeEmptyBlock).toContain(
      "FileSyncState.hasUnsavedChanges(fileId)",
    );
    expect(nativeEmptyBlock).toContain(
      "blockLeaveAfterNativeSnapshotFailure(fileId)",
    );
    expect(blockLeaveHelper).toContain("clearAppShellPendingNavigation()");
    expect(blockLeaveHelper).toContain('setStatus("保存失败")');
    expect(nativeEmptyBlock).not.toContain("finishNavigateHome();\n        }");
  });

  it("preserves newer dirty state when an older save finishes after more edits", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "useMindMapFileSave.ts"),
      "utf8",
    );

    expect(source).toContain("FileSyncState.setDraftHash(fileId, hash)");
    expect(source).toContain("preserveNewerLocalDirty");
    expect(source).toContain("preserveDirty: preserveNewerLocalDirty");
    expect(source).toContain("mindmap.save.navigate_deferred_dirty");
  });
});
