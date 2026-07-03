import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const flagsPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "desktopBuildFlags.json",
);

describe("applyDesktopBuildFlags", () => {
  let backupFlags = null;
  let hadFlagsFile = false;
  const originalDebug = process.env.EDITORHUB_DESKTOP_DEBUG;
  const originalDeploy = process.env.DEPLOY_DEBUG;

  beforeEach(() => {
    hadFlagsFile = existsSync(flagsPath);
    backupFlags = hadFlagsFile ? readFileSync(flagsPath, "utf8") : null;
    delete process.env.EDITORHUB_DESKTOP_DEBUG;
    delete process.env.DEPLOY_DEBUG;
    vi.resetModules();
  });

  afterEach(() => {
    if (hadFlagsFile) {
      writeFileSync(flagsPath, backupFlags, "utf8");
    } else if (existsSync(flagsPath)) {
      rmSync(flagsPath);
    }
    vi.resetModules();
    if (originalDebug === undefined) {
      delete process.env.EDITORHUB_DESKTOP_DEBUG;
    } else {
      process.env.EDITORHUB_DESKTOP_DEBUG = originalDebug;
    }
    if (originalDeploy === undefined) {
      delete process.env.DEPLOY_DEBUG;
    } else {
      process.env.DEPLOY_DEBUG = originalDeploy;
    }
  });

  it("reads debugPack from desktopBuildFlags.json", async () => {
    writeFileSync(
      flagsPath,
      `${JSON.stringify({ debugPack: true, builtAt: "2026-01-01T00:00:00.000Z" })}\n`,
      "utf8",
    );
    const { readDesktopBuildFlags } = await import("./applyDesktopBuildFlags.mjs");
    expect(readDesktopBuildFlags()).toEqual({
      debugPack: true,
      builtAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("enables desktop debug env when debugPack is baked in", async () => {
    writeFileSync(flagsPath, `${JSON.stringify({ debugPack: true })}\n`, "utf8");
    const { applyDesktopBuildFlags } = await import("./applyDesktopBuildFlags.mjs");
    const flags = applyDesktopBuildFlags();
    expect(flags.debugPack).toBe(true);
    expect(process.env.EDITORHUB_DESKTOP_DEBUG).toBe("1");
    expect(process.env.DEPLOY_DEBUG).toBe("1");
  });

  it("does not override explicit runtime env when debugPack is false", async () => {
    writeFileSync(flagsPath, `${JSON.stringify({ debugPack: false })}\n`, "utf8");
    process.env.EDITORHUB_DESKTOP_DEBUG = "0";
    const { applyDesktopBuildFlags } = await import("./applyDesktopBuildFlags.mjs");
    applyDesktopBuildFlags();
    expect(process.env.EDITORHUB_DESKTOP_DEBUG).toBe("0");
    expect(process.env.DEPLOY_DEBUG).toBeUndefined();
  });
});
