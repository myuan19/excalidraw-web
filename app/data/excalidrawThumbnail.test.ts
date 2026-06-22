import { beforeEach, describe, expect, it, vi } from "vitest";

import { LocalThumbnailCache } from "./localThumbnailCache";
import { generateExcalidrawThumbnailAndCache } from "./excalidrawThumbnail";

const { buildAndCacheFileThumbnailMock } = vi.hoisted(() => ({
  buildAndCacheFileThumbnailMock: vi.fn(async () => "<svg></svg>"),
}));

vi.mock("./thumbnailService", () => ({
  buildAndCacheFileThumbnail: buildAndCacheFileThumbnailMock,
}));

vi.mock("./localThumbnailCache", () => ({
  LocalThumbnailCache: {
    set: vi.fn(),
  },
}));

describe("generateExcalidrawThumbnailAndCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildAndCacheFileThumbnailMock.mockResolvedValue("<svg></svg>");
  });

  it("builds svg and writes session cache", async () => {
    const scene = {
      elements: [{ id: "a" }],
      appState: { viewBackgroundColor: "#fff" },
      files: {},
    };

    const svg = await generateExcalidrawThumbnailAndCache("file-id-123", scene);

    expect(buildAndCacheFileThumbnailMock).toHaveBeenCalledWith(
      "file-id-123",
      {
        kind: "excalidraw",
        data: scene,
      },
      expect.objectContaining({
        sceneHash: expect.any(String),
        contentSha: null,
      }),
    );
    expect(svg).toBe("<svg></svg>");
    expect(LocalThumbnailCache.set).not.toHaveBeenCalled();
  });

  it("returns undefined when build fails", async () => {
    buildAndCacheFileThumbnailMock.mockRejectedValueOnce(new Error("boom"));

    const svg = await generateExcalidrawThumbnailAndCache("file-id-123", {
      elements: [],
      appState: {},
      files: {},
    });

    expect(svg).toBeUndefined();
    expect(LocalThumbnailCache.set).not.toHaveBeenCalled();
  });
});
