import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordRecentFile } from "@/features/home/recentFiles";
import { TempFileStorage } from "@/features/tempFiles/TempFileStorage";
import { resolveRecentFiles } from "./resolveRecentFiles";
import type { ServerFile } from "@/types/file";

const serverFile: ServerFile = {
  id: "server-a",
  name: "Server A",
  kind: "excalidraw",
  folder_id: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  has_thumbnail: false,
  archive_count: 0,
};

function installStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  });
  vi.stubGlobal("window", {
    dispatchEvent: vi.fn(),
  });
}

describe("resolveRecentFiles", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    installStorage();
  });

  it("excludes temp file ids from recent list", () => {
    recordRecentFile("local-temp:aaa");
    recordRecentFile("server-a");
    TempFileStorage.upsert({
      id: "local-temp:aaa",
      name: "Temp",
      kind: "mindmap",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    expect(resolveRecentFiles([serverFile]).map((f) => f.id)).toEqual(["server-a"]);
  });

  it("skips unknown ids", () => {
    recordRecentFile("missing-id");
    recordRecentFile("server-a");
    expect(resolveRecentFiles([serverFile]).map((f) => f.id)).toEqual(["server-a"]);
  });
});
