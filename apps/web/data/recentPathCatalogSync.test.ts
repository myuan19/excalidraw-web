import { describe, expect, it, vi, afterEach } from "vitest";

import {
  fingerprintRecentAbsPaths,
  findCatalogFileByAbsPath,
  mergeCatalogFileForRecentDisplay,
  mergeRecentPathCatalogBatch,
} from "./recentPathCatalogSync";
import * as recentFiles from "./recentFiles";
import type { ServerFile } from "./ServerSync";

describe("recentPathCatalogSync", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fingerprints paths case-insensitively regardless of order", () => {
    expect(fingerprintRecentAbsPaths(["C:/B.smm", "C:/a.smm"])).toBe(
      fingerprintRecentAbsPaths(["c:\\a.smm", "c:\\b.smm"]),
    );
  });

  it("preserves has_thumbnail from tree or previous resolve", () => {
    const resolved = {
      id: "file-1",
      name: "a",
      kind: "excalidraw",
      has_thumbnail: false,
      content_sha256: "sha-1",
    } as ServerFile;
    const merged = mergeCatalogFileForRecentDisplay(resolved, {
      fromTree: {
        ...resolved,
        has_thumbnail: true,
      },
    });
    expect(merged.has_thumbnail).toBe(true);
  });

  it("findCatalogFileByAbsPath matches path registry on tree files", () => {
    vi.spyOn(recentFiles, "getRecentPathForFileId").mockImplementation((fileId) =>
      fileId === "file-1" ? "C:/data/demo.smm" : null,
    );
    const filesById = new Map<string, ServerFile>([
      [
        "file-1",
        { id: "file-1", name: "demo", kind: "mindmap" } as ServerFile,
      ],
    ]);
    expect(findCatalogFileByAbsPath("c:\\data\\demo.smm", filesById)?.id).toBe(
      "file-1",
    );
  });

  it("mergeRecentPathCatalogBatch keeps failed paths from previous catalog", () => {
    const prev = {
      "C:/old.smm": { id: "old", name: "old", kind: "mindmap" } as ServerFile,
    };
    const merged = mergeRecentPathCatalogBatch(
      prev,
      ["C:/new.smm"],
      {
        "C:/new.smm": {
          id: "new",
          name: "new",
          kind: "mindmap",
        } as ServerFile,
      },
      new Map(),
      { replaceScope: true },
    );
    expect(Object.keys(merged)).toEqual(["C:/new.smm"]);
    expect(merged["C:/new.smm"]?.id).toBe("new");
  });
});
