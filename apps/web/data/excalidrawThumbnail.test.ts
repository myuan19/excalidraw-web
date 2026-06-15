import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./thumbnailSvg", () => ({
  buildSceneThumbnailSvg: vi.fn(async () => "<svg></svg>"),
}));

vi.mock("./localThumbnailCache", () => ({
  LocalThumbnailCache: {
    set: vi.fn(),
  },
}));

import { LocalThumbnailCache } from "./localThumbnailCache";
import { buildSceneThumbnailSvg } from "./thumbnailSvg";
import { generateExcalidrawThumbnailAndCache } from "./excalidrawThumbnail";

describe("generateExcalidrawThumbnailAndCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildSceneThumbnailSvg).mockResolvedValue("<svg></svg>");
  });

  it("builds svg and writes session cache", async () => {
    const scene = {
      elements: [{ id: "a" }],
      appState: { viewBackgroundColor: "#fff" },
      files: {},
    };

    const svg = await generateExcalidrawThumbnailAndCache("file-id-123", scene);

    expect(buildSceneThumbnailSvg).toHaveBeenCalledWith(scene);
    expect(LocalThumbnailCache.set).toHaveBeenCalledWith("file-id-123", "<svg></svg>");
    expect(svg).toBe("<svg></svg>");
  });

  it("returns undefined when export fails", async () => {
    vi.mocked(buildSceneThumbnailSvg).mockRejectedValueOnce(new Error("boom"));

    const svg = await generateExcalidrawThumbnailAndCache("file-id-123", {
      elements: [],
      appState: {},
      files: {},
    });

    expect(svg).toBeUndefined();
    expect(LocalThumbnailCache.set).not.toHaveBeenCalled();
  });
});
