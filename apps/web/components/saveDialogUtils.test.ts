import { describe, expect, it } from "vitest";

import {
  hasSaveNameConflict,
  normalizeSaveBaseName,
  saveExtensionForKind,
} from "./saveDialogUtils";

describe("saveDialogUtils", () => {
  it("resolves default extension by document kind", () => {
    expect(saveExtensionForKind("mindmap")).toBe(".smm");
    expect(saveExtensionForKind("excalidraw")).toBe(".excalidraw");
  });

  it("keeps only the base name for backend saves", () => {
    expect(normalizeSaveBaseName("未命名", ".smm")).toBe("未命名");
    expect(normalizeSaveBaseName("board.excalidraw", ".excalidraw")).toBe(
      "board",
    );
  });

  it("detects same-folder same-kind save name conflicts after normalization", () => {
    expect(
      hasSaveNameConflict({
        files: [
          {
            id: "file-1",
            name: "Map.smm",
            kind: "mindmap",
            folder_id: "folder-1",
            created_at: "",
            updated_at: "",
          },
          {
            id: "file-2",
            name: "Map",
            kind: "excalidraw",
            folder_id: "folder-1",
            created_at: "",
            updated_at: "",
          },
        ],
        folderId: "folder-1",
        documentKind: "mindmap",
        name: "map",
      }),
    ).toBe(true);

    expect(
      hasSaveNameConflict({
        files: [
          {
            id: "file-1",
            name: "Map",
            kind: "mindmap",
            folder_id: "folder-2",
            created_at: "",
            updated_at: "",
          },
        ],
        folderId: "folder-1",
        documentKind: "mindmap",
        name: "map",
      }),
    ).toBe(false);
  });
});
