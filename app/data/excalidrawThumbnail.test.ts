import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateExcalidrawThumbnailAndCache } from "./excalidrawThumbnail";

const { buildExcalidrawSceneThumbnailSvgMock } = vi.hoisted(() => ({
  buildExcalidrawSceneThumbnailSvgMock: vi.fn(async () =>
    '<svg xmlns="http://www.w3.org/2000/svg" data-excal-filelist-thumb="1" viewBox="0 0 100 60"><rect width="100" height="60" fill="#fff"/><path d="M0 0L10 10"/></svg>',
  ),
}));

vi.mock("./excalidrawSceneThumbnail", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./excalidrawSceneThumbnail")>();
  return {
    ...actual,
    buildExcalidrawSceneThumbnailSvg: buildExcalidrawSceneThumbnailSvgMock,
  };
});

describe("generateExcalidrawThumbnailAndCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    buildExcalidrawSceneThumbnailSvgMock.mockResolvedValue(
      '<svg xmlns="http://www.w3.org/2000/svg" data-excal-filelist-thumb="1" viewBox="0 0 100 60"><rect width="100" height="60" fill="#fff"/><path d="M0 0L10 10"/></svg>',
    );
  });

  it("exports svg and writes session cache with scene hash", async () => {
    const scene = {
      elements: [{ id: "a", type: "rectangle", x: 0, y: 0, width: 10, height: 10 }],
      appState: { viewBackgroundColor: "#ffffff" },
      files: {},
    };

    const svg = await generateExcalidrawThumbnailAndCache("file-id-123", scene);

    expect(buildExcalidrawSceneThumbnailSvgMock).toHaveBeenCalled();
    expect(svg).toContain("<svg");
    expect(sessionStorage.getItem("excalidraw-web-local-thumb-file-id-123")).toContain(
      "<svg",
    );
  });

  it("returns undefined when export fails", async () => {
    buildExcalidrawSceneThumbnailSvgMock.mockRejectedValueOnce(new Error("boom"));

    const svg = await generateExcalidrawThumbnailAndCache("file-id-123", {
      elements: [{ id: "a", type: "rectangle", x: 0, y: 0, width: 10, height: 10 }],
      appState: {},
      files: {},
    });

    expect(svg).toBeUndefined();
  });
});
