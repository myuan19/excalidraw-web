import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

describe("desktopOpLog", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it("writes desktop client logs to a per-startup session file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "desktop-op-log-"));
    process.env.EDITORHUB_DESKTOP = "1";
    process.env.EDITORHUB_DESKTOP_LOG_DIR = dir;

    const { getDesktopOpLogBasename, writeDesktopClientLog } = await import(
      "./desktopOpLog.js"
    );

    writeDesktopClientLog({
      ts: "2026-06-18T01:00:00.000Z",
      level: "debug",
      module: "mindmapOp",
      msg: "trace",
      event: "mindmap.persist.save",
      context: { run: "run-1" },
      data: { opSeq: 1 },
      fields: { fileId8: "abcd1234" },
    });

    const basename = getDesktopOpLogBasename();
    expect(basename).toMatch(/^desktop-op-\d{8}-\d{6}\.log$/);
    const logPath = join(dir, basename);
    expect(existsSync(logPath)).toBe(true);
    const [line] = readFileSync(logPath, "utf-8").trim().split("\n");
    expect(JSON.parse(line).details).toMatchObject({
      event: "mindmap.persist.save",
      run: "run-1",
      opSeq: 1,
      fileId8: "abcd1234",
    });
  });

  it("prunes oldest desktop-op logs until total size is under the cap", async () => {
    const dir = mkdtempSync(join(tmpdir(), "desktop-op-prune-"));
    process.env.EDITORHUB_DESKTOP = "1";
    process.env.EDITORHUB_DESKTOP_LOG_DIR = dir;
    process.env.LOG_MAX_TOTAL_SIZE = "1200";

    const oldLog = "desktop-op-20260101-000000.log";
    const newerLog = "desktop-op-20260102-000000.log";
    writeFileSync(join(dir, oldLog), "x".repeat(900));
    writeFileSync(join(dir, newerLog), "y".repeat(900));

    const { getDesktopOpLogBasename, pruneDesktopOpLogs } = await import(
      "./desktopOpLog.js"
    );

    const result = pruneDesktopOpLogs();

    expect(result.removed).toContain(oldLog);
    expect(existsSync(join(dir, oldLog))).toBe(false);
    expect(existsSync(join(dir, newerLog))).toBe(true);
    expect(existsSync(join(dir, getDesktopOpLogBasename()))).toBe(false);
    const total = readdirSync(dir).reduce(
      (sum, name) => sum + statSync(join(dir, name)).size,
      0,
    );
    expect(total).toBeLessThanOrEqual(1200);
  });
});
