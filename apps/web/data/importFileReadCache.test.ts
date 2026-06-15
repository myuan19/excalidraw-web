import { describe, expect, it, vi } from "vitest";

import {
  parseImportFileJson,
  parseImportFileJsonMaybe,
  readImportFileText,
} from "./importFileReadCache";

function mockFile(text: string): File {
  return {
    text: vi.fn(async () => text),
  } as unknown as File;
}

function mockUnreadableFile(): File {
  return {
    text: vi.fn(async () => {
      throw new Error("read failed");
    }),
  } as unknown as File;
}

describe("importFileReadCache", () => {
  it("reuses text and JSON parsing for the same File object", async () => {
    const file = mockFile('{"root":{"data":{"text":"导图"}}}');

    await expect(readImportFileText(file)).resolves.toContain("root");
    await expect(parseImportFileJsonMaybe(file)).resolves.toEqual({
      root: { data: { text: "导图" } },
    });
    await expect(parseImportFileJson(file)).resolves.toEqual({
      root: { data: { text: "导图" } },
    });

    expect(file.text).toHaveBeenCalledTimes(1);
  });

  it("throws from the strict JSON parser for invalid files", async () => {
    const file = mockFile("not-json");

    await expect(parseImportFileJsonMaybe(file)).resolves.toBeUndefined();
    await expect(parseImportFileJson(file)).rejects.toThrow("Invalid MindMap JSON");
  });

  it("does not hide file read failures from format detection callers", async () => {
    const file = mockUnreadableFile();

    await expect(parseImportFileJsonMaybe(file)).rejects.toThrow("read failed");
    await expect(parseImportFileJson(file)).rejects.toThrow("Invalid MindMap JSON");
  });
});
