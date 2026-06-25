import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_DATA_DIRECTORY_PATH,
  updateAppSettings,
} from "./appSettings";
import { resolveDefaultDataDirectoryPath } from "./mappedFolderClient";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("mappedFolderClient default data directory", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    updateAppSettings({ defaultDataDirectoryPath: DEFAULT_DATA_DIRECTORY_PATH });
    Object.defineProperty(window, "editorHubDesktop", {
      configurable: true,
      value: {
        getDefaultDataDirectoryPath: vi.fn(
          () => "C:/Users/me/Documents/EditorHub",
        ),
      },
    });
  });

  it("resolves the default Documents folder before mapping", async () => {
    const result = await resolveDefaultDataDirectoryPath();

    expect(result).toBe("C:/Users/me/Documents/EditorHub");
    expect(window.editorHubDesktop?.getDefaultDataDirectoryPath).toHaveBeenCalled();
  });

  it("maps a custom configured directory directly", async () => {
    updateAppSettings({ defaultDataDirectoryPath: "D:/Notes" });

    const result = await resolveDefaultDataDirectoryPath();

    expect(window.editorHubDesktop?.getDefaultDataDirectoryPath).not.toHaveBeenCalled();
    expect(result).toBe("D:/Notes");
  });

  it("keeps mapping behind the shared add mapped folder helper", async () => {
    const source = fs.readFileSync(
      path.join(__dirname, "mappedFolderClient.ts"),
      "utf8",
    );

    expect(source).toContain("ensureDefaultDataDirectoryMapped");
    expect(source).toContain("return addMappedFolderRoot({ absPath });");
  });
});
