import { FileSyncState } from "../../data/FileSyncState";
import { MindMapAdapter } from "../../data/formats/registry";
import { readMindMapBrowserView } from "../../data/mindMapBrowserViewStorage";

import {
  getCachedMindMapDocument,
  shouldSkipMindMapThumbnailServerSave,
} from "./useMindMapFileSave";

describe("useMindMapFileSave cache helpers", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("migrates cached MindMap view into browser-local view storage", () => {
    const document = MindMapAdapter.toDocument({
      ...MindMapAdapter.createEmpty(),
      view: {
        transform: { scaleX: 1, scaleY: 1, translateX: 120, translateY: -40 },
        state: { scale: 1, x: 120, y: -40, sx: 0, sy: 0 },
      },
    });
    const cachedDocument = {
      ...document,
      data: {
        ...document.data,
        view: {
          transform: { scaleX: 1, scaleY: 1, translateX: 120, translateY: -40 },
          state: { scale: 1, x: 120, y: -40, sx: 0, sy: 0 },
        },
      },
    };
    window.localStorage.setItem(
      FileSyncState.localCacheKey("mindmap-file"),
      JSON.stringify({
        v: 1,
        payload: {
          document: cachedDocument,
          elements: undefined,
          appState: undefined,
          files: {},
          deltas: [],
        },
      }),
    );

    const cached = getCachedMindMapDocument("mindmap-file");

    expect(cached?.data).not.toHaveProperty("view");
    expect(readMindMapBrowserView("mindmap-file")).toEqual(
      cachedDocument.data.view,
    );
    expect(
      FileSyncState.getLocalCache("mindmap-file")?.document?.data,
    ).not.toHaveProperty("view");
  });
});

describe("MindMap thumbnail maintenance saves", () => {
  it("skips server writes when thumbnail maintenance sees dirty content", () => {
    expect(
      shouldSkipMindMapThumbnailServerSave({
        source: "thumbnail",
        contentHash: "draft-hash",
        baselineHash: "baseline-hash",
      }),
    ).toBe(true);
  });

  it("allows thumbnail maintenance only when content still matches baseline", () => {
    expect(
      shouldSkipMindMapThumbnailServerSave({
        source: "thumbnail",
        contentHash: "baseline-hash",
        baselineHash: "baseline-hash",
      }),
    ).toBe(false);
  });

  it("does not affect real content save sources", () => {
    expect(
      shouldSkipMindMapThumbnailServerSave({
        source: "auto",
        contentHash: "draft-hash",
        baselineHash: "baseline-hash",
      }),
    ).toBe(false);
  });
});
