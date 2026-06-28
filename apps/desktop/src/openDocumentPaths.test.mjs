import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  isOpenableDocumentPath,
  parseOpenDocumentArgv,
} from "./openDocumentPaths.mjs";

describe("openDocumentPaths", () => {
  it("recognizes supported document extensions", () => {
    expect(isOpenableDocumentPath("/tmp/drawing.excalidraw")).toBe(true);
    expect(isOpenableDocumentPath("C:\\docs\\map.smm")).toBe(true);
    expect(isOpenableDocumentPath("./lib.excalidrawlib")).toBe(true);
    expect(isOpenableDocumentPath("mind.mindmap.json")).toBe(true);
    expect(isOpenableDocumentPath("scene.excalidraw.json")).toBe(true);
    expect(isOpenableDocumentPath("/tmp/readme.txt")).toBe(false);
    expect(isOpenableDocumentPath("")).toBe(false);
  });

  it("parses argv and deduplicates resolved paths", () => {
    const abs = path.resolve("sample.excalidraw");
    const argv = [
      process.execPath,
      "EditorHub.exe",
      "--flag",
      abs,
      abs,
      "other.txt",
      path.resolve("nested/map.smm"),
    ];
    const parsed = parseOpenDocumentArgv(argv);
    expect(parsed).toEqual([abs, path.resolve("nested/map.smm")]);
  });
});
