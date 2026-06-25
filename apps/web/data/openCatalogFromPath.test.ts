import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isCorruptCatalogFile,
} from "./catalogCapabilities";
import {
  openCatalogFromPath,
  openOrTrackCatalogFromPath,
} from "./openCatalogFromPath";
import { ServerSync } from "./ServerSync";
import {
  getRecentFileEntries,
  RECENT_FILES_KEY,
  toRecentPathEntryId,
} from "./recentFiles";

vi.mock("./catalogCapabilities", () => ({
  isCorruptCatalogFile: vi.fn(() => false),
}));

vi.mock("../editors/registry", () => ({
  editorRegistry: {
    resolveKind: (kind?: string) => kind || "excalidraw",
  },
}));

vi.mock("./ServerSync", () => ({
  ServerSync: {
    resolveCatalogFileByPath: vi.fn(),
    trackCatalogFileByPath: vi.fn(),
  },
  ServerSyncError: class ServerSyncError extends Error {
    status: number;
    body: string;
    constructor(message: string, status: number, _path: string, body: string) {
      super(message);
      this.status = status;
      this.body = body;
    }
  },
  getServerSyncErrorJson: vi.fn((error: unknown) => {
    if (error instanceof Error && "body" in error) {
      try {
        return JSON.parse(String((error as { body: string }).body));
      } catch {
        return null;
      }
    }
    return null;
  }),
}));

describe("openCatalogFromPath", () => {
  afterEach(() => {
    localStorage.removeItem(RECENT_FILES_KEY);
    vi.clearAllMocks();
  });

  it("records the path in recent and returns an open action for managed files", async () => {
    vi.mocked(ServerSync.resolveCatalogFileByPath).mockResolvedValue({
      absPath: "C:/data/demo.smm",
      file: {
        id: "file-1",
        name: "demo",
        kind: "mindmap",
        created_at: "",
        updated_at: "",
        origin: "managed",
      },
    });

    const result = await openCatalogFromPath("C:/data/demo.smm");

    expect(result).toMatchObject({
      status: "open",
      catalogId: "file-1",
      kind: "mindmap",
    });
    expect(getRecentFileEntries()[0]?.id).toBe(
      toRecentPathEntryId("C:/data/demo.smm"),
    );
  });

  it("opens discovered catalog files directly like managed files", async () => {
    vi.mocked(ServerSync.resolveCatalogFileByPath).mockResolvedValue({
      absPath: "C:/mapped/demo.smm",
      file: {
        id: "file-2",
        name: "demo",
        kind: "mindmap",
        created_at: "",
        updated_at: "",
        origin: "managed",
      },
    });

    const result = await openCatalogFromPath("C:/mapped/demo.smm");

    expect(result).toMatchObject({
      status: "open",
      catalogId: "file-2",
      kind: "mindmap",
    });
    expect(getRecentFileEntries()[0]?.id).toBe(
      toRecentPathEntryId("C:/mapped/demo.smm"),
    );
  });

  it("returns preview for corrupt files", async () => {
    vi.mocked(isCorruptCatalogFile).mockReturnValueOnce(true);
    vi.mocked(ServerSync.resolveCatalogFileByPath).mockResolvedValue({
      absPath: "C:/mapped/broken.smm",
      file: {
        id: "file-3",
        name: "broken",
        kind: "mindmap",
        created_at: "",
        updated_at: "",
        health: "corrupt",
        parse_error: "invalid json",
      },
    });

    const result = await openCatalogFromPath("C:/mapped/broken.smm");

    expect(result.status).toBe("preview");
  });

  it("tracks external files when resolve misses catalog", async () => {
    const notInCatalog = new Error("not in catalog") as Error & {
      body: string;
    };
    notInCatalog.body = JSON.stringify({ code: "not_in_catalog" });
    vi.mocked(ServerSync.resolveCatalogFileByPath).mockRejectedValue(
      notInCatalog,
    );
    vi.mocked(ServerSync.trackCatalogFileByPath).mockResolvedValue({
      absPath: "C:/data/demo.smm",
      tracked: true,
      file: {
        id: "file-4",
        name: "demo",
        kind: "mindmap",
        created_at: "",
        updated_at: "",
        origin: "external",
      },
    });

    const result = await openOrTrackCatalogFromPath("C:/Downloads/demo.smm");

    expect(ServerSync.trackCatalogFileByPath).toHaveBeenCalledWith(
      "C:/Downloads/demo.smm",
    );
    expect(result).toMatchObject({
      status: "open",
      catalogId: "file-4",
      tracked: true,
    });
  });
});
