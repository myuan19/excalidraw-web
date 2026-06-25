import { afterEach, describe, expect, it } from "vitest";

import {
  getDroppedFileAbsPath,
  readDroppedFileAbsPaths,
} from "./droppedFilePath";

describe("droppedFilePath", () => {
  afterEach(() => {
    delete window.editorHubDesktop;
  });

  it("prefers desktop getPathForFile over legacy file.path", () => {
    window.editorHubDesktop = {
      platform: "win32",
      getPathForFile: () => "C:/data/map.smm",
    };
    const file = { path: "C:/legacy/map.smm" } as File;
    expect(getDroppedFileAbsPath(file)).toBe("C:/data/map.smm");
  });

  it("falls back to legacy file.path when desktop helper is unavailable", () => {
    const file = { path: "C:/legacy/map.smm" } as File;
    expect(getDroppedFileAbsPath(file)).toBe("C:/legacy/map.smm");
  });

  it("reads multiple dropped paths", () => {
    window.editorHubDesktop = {
      platform: "win32",
      getPathForFile: (file) => (file as File & { path?: string }).path ?? "",
    };
    const files = [
      { path: "C:/data/a.smm" } as File,
      { path: "C:/data/b.excalidraw" } as File,
    ];
    expect(readDroppedFileAbsPaths(files)).toEqual([
      "C:/data/a.smm",
      "C:/data/b.excalidraw",
    ]);
  });
});
