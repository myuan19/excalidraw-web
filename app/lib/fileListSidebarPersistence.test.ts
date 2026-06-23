import { beforeEach, describe, expect, it } from "vitest";

import {
  readAllFilesTreeExpanded,
  readExpandedFolders,
  writeAllFilesTreeExpanded,
  writeExpandedFolders,
} from "./fileListSidebarPersistence";

describe("fileListSidebarPersistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists all-files tree expanded flag", () => {
    expect(readAllFilesTreeExpanded()).toBe(true);
    writeAllFilesTreeExpanded(false);
    expect(readAllFilesTreeExpanded()).toBe(false);
    writeAllFilesTreeExpanded(true);
    expect(readAllFilesTreeExpanded()).toBe(true);
  });

  it("persists per-folder expand map", () => {
    writeExpandedFolders({ folder_a: false, folder_b: true });
    expect(readExpandedFolders()).toEqual({
      folder_a: false,
      folder_b: true,
    });
  });
});
