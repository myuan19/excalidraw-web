import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, statSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { parseByteSize, pruneLogFiles } from "./logPrune.js";
import { createLogSessionId, formatLogTimestamp, sessionLogBasename } from "../config/logNaming.js";

describe("parseByteSize", () => {
  it("parses megabyte specs", () => {
    expect(parseByteSize("10M")).toBe(10 * 1024 * 1024);
    expect(parseByteSize("200M")).toBe(200 * 1024 * 1024);
  });
});

describe("pruneLogFiles", () => {
  it("removes oldest session logs when total exceeds limit", () => {
    const dir = mkdtempSync(join(tmpdir(), "excal-log-"));
    const oldId = "20260101-120000-1";
    const newId = "20260102-120000-2";
    const oldFile = sessionLogBasename("server", oldId);
    const newFile = sessionLogBasename("server", newId);

    writeFileSync(join(dir, oldFile), "x".repeat(1024));
    writeFileSync(join(dir, newFile), "y".repeat(512));

    const result = pruneLogFiles(dir, {
      prefix: "server",
      protectBasenames: [newFile],
      maxTotalBytes: 800,
      maxFileCount: null,
    });

    expect(result.removed).toContain(oldFile);
    expect(existsSync(join(dir, oldFile))).toBe(false);
    expect(existsSync(join(dir, newFile))).toBe(true);
    expect(statSync(join(dir, newFile)).size).toBe(512);
  });

  it("prunes legacy server.log when over total cap", () => {
    const dir = mkdtempSync(join(tmpdir(), "excal-log-legacy-"));
    writeFileSync(join(dir, "server.log"), "x".repeat(2048));

    const result = pruneLogFiles(dir, {
      prefix: "server",
      protectBasenames: [],
      maxTotalBytes: 1024,
      maxFileCount: null,
    });

    expect(result.removed).toContain("server.log");
    expect(existsSync(join(dir, "server.log"))).toBe(false);
  });
});

describe("createLogSessionId", () => {
  it("uses local date and time without pid", () => {
    const id = createLogSessionId(new Date("2026-05-30T13:30:45"));
    expect(id).toBe("20260530-133045");
  });
});

describe("formatLogTimestamp", () => {
  it("formats local wall clock with offset", () => {
    const ts = formatLogTimestamp(new Date("2026-05-30T05:30:45.123Z"));
    expect(ts).toMatch(/^2026-05-30T\d{2}:30:45\.123[+-]\d{2}:\d{2}$/);
  });
});
