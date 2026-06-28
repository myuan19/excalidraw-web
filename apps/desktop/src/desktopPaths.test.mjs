import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DESKTOP_DATA_SUBDIR,
  prepareDesktopPathLayout,
  resetDesktopPathLayoutForTests,
  resolveAppDataDir,
  resolveAppCacheDir,
  resolveAppLogsDir,
  resolveCatalogRoot,
  resolveCatalogSidecarDir,
  resolveDefaultUserDataRoot,
  resolveUserDataRoot,
} from "./desktopPaths.mjs";

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "editorhub-paths-"));
}

function createMockApp(userDataRoot) {
  return {
    isReady: () => false,
    getPath: (name) => {
      if (name === "userData") {
        return userDataRoot;
      }
      throw new Error(`unexpected getPath: ${name}`);
    },
    setPath: () => {},
  };
}

describe("desktopPaths", () => {
  const tempDirs = [];

  afterEach(() => {
    resetDesktopPathLayoutForTests();
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("places app data under userData/data and catalog sidecar path", () => {
    const root = createTempDir();
    tempDirs.push(root);
    const app = createMockApp(root);
    expect(resolveAppDataDir(app)).toBe(path.join(root, DESKTOP_DATA_SUBDIR));
    expect(resolveCatalogRoot(app)).toBe(path.join(root, "catalog"));
    expect(resolveCatalogSidecarDir(app)).toBe(
      path.join(root, "catalog", ".editorhub"),
    );
    expect(resolveUserDataRoot(app)).toBe(root);
  });

  it("prefers LOCALAPPDATA for cache on Windows", () => {
    const root = createTempDir();
    tempDirs.push(root);
    const app = createMockApp(root);
    const previous = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = root;
    try {
      expect(resolveAppCacheDir(app)).toBe(
        path.join(root, "EditorHub", "cache"),
      );
    } finally {
      if (previous === undefined) {
        delete process.env.LOCALAPPDATA;
      } else {
        process.env.LOCALAPPDATA = previous;
      }
    }
  });

  it("places logs under LOCALAPPDATA on Windows", () => {
    const root = createTempDir();
    tempDirs.push(root);
    const app = createMockApp(root);
    const previous = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = root;
    try {
      expect(resolveAppLogsDir(app)).toBe(path.join(root, "EditorHub", "logs"));
    } finally {
      if (previous === undefined) {
        delete process.env.LOCALAPPDATA;
      } else {
        process.env.LOCALAPPDATA = previous;
      }
    }
  });

  it("keeps catalog under APPDATA userData when LOCALAPPDATA is set", () => {
    const localRoot = createTempDir();
    const roamingRoot = createTempDir();
    tempDirs.push(localRoot, roamingRoot);
    const prevLocal = process.env.LOCALAPPDATA;
    const prevAppData = process.env.APPDATA;
    process.env.LOCALAPPDATA = localRoot;
    process.env.APPDATA = roamingRoot;
    const app = createMockApp(path.join(roamingRoot, "EditorHub"));
    try {
      prepareDesktopPathLayout(app);
      const userData = resolveDefaultUserDataRoot();
      expect(userData).toBe(path.join(roamingRoot, "EditorHub"));
      expect(resolveCatalogRoot(app)).toBe(path.join(userData, "catalog"));
      expect(resolveCatalogRoot(app)).not.toContain(path.join("cache", "EditorHub"));
    } finally {
      if (prevLocal === undefined) {
        delete process.env.LOCALAPPDATA;
      } else {
        process.env.LOCALAPPDATA = prevLocal;
      }
      if (prevAppData === undefined) {
        delete process.env.APPDATA;
      } else {
        process.env.APPDATA = prevAppData;
      }
    }
  });
});
