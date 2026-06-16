import { beforeEach, describe, expect, it, vi } from "vitest";

import { MindMapAdapter } from "./formats/MindMapAdapter";
import {
  readMindMapBrowserView,
  saveMindMapBrowserView,
} from "./mindMapBrowserViewStorage";
import { saveNewDocument } from "./saveNewDocument";

const mocks = vi.hoisted(() => ({
  buildAndCacheFileThumbnail: vi.fn(async () => "<svg />"),
  copyForkBrowserSceneBetweenFiles: vi.fn(),
  discardLocalDraftSession: vi.fn(async () => {}),
  fileSyncState: {
    alignHashes: vi.fn(),
    getBaselineHash: vi.fn(() => "baseline-hash"),
    getServerHash: vi.fn(() => "saved-sha"),
    setLocalCache: vi.fn(),
    setServerHash: vi.fn(),
  },
  hashDocumentSnapshot: vi.fn(() => "document-hash"),
  hashSceneSnapshot: vi.fn(() => "scene-hash"),
  localThumbnailSet: vi.fn(),
  recordRecentFileAccess: vi.fn(),
  saveFileImmediate: vi.fn(async (..._args: unknown[]) => ({
    content_sha256: "saved-sha",
  })),
  createFile: vi.fn(async () => ({
    id: "server-file",
    kind: "mindmap",
    content_sha256: "created-sha",
  })),
  setDeltaFileId: vi.fn(async () => {}),
  toMindMapLocalCacheRecord: vi.fn((document: unknown) => ({ document })),
}));

vi.mock("../editors/mindmap/useMindMapFileSave", () => ({
  toMindMapLocalCacheRecord: mocks.toMindMapLocalCacheRecord,
}));

vi.mock("./DeltaStorage", () => ({
  DeltaStorage: {
    setFileId: mocks.setDeltaFileId,
  },
}));

vi.mock("./discardLocalDraftSession", () => ({
  discardLocalDraftSession: mocks.discardLocalDraftSession,
}));

vi.mock("./thumbnailService", () => ({
  buildAndCacheFileThumbnail: mocks.buildAndCacheFileThumbnail,
}));

vi.mock("./FileSyncState", () => ({
  FileSyncState: mocks.fileSyncState,
}));

vi.mock("./forkBrowserSceneStorage", () => ({
  copyForkBrowserSceneBetweenFiles: mocks.copyForkBrowserSceneBetweenFiles,
}));

vi.mock("./localThumbnailCache", () => ({
  LocalThumbnailCache: {
    set: mocks.localThumbnailSet,
  },
}));

vi.mock("./recentFiles", () => ({
  recordRecentFileAccess: mocks.recordRecentFileAccess,
}));

vi.mock("./sceneHash", () => ({
  hashDocumentSnapshot: mocks.hashDocumentSnapshot,
  hashSceneSnapshot: mocks.hashSceneSnapshot,
}));

vi.mock("./ServerSync", () => ({
  ServerSync: {
    createFile: mocks.createFile,
    saveFileImmediate: mocks.saveFileImmediate,
  },
}));

describe("saveNewDocument", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    mocks.fileSyncState.getBaselineHash.mockReturnValue("baseline-hash");
    mocks.createFile.mockResolvedValue({
      id: "server-file",
      kind: "mindmap",
      content_sha256: "created-sha",
    });
    mocks.saveFileImmediate.mockResolvedValue({ content_sha256: "saved-sha" });
  });

  it("moves MindMap local-draft viewport to the promoted server file", async () => {
    const draftId = "local-draft:mindmap-1";
    const view = {
      transform: {
        scaleX: 1.25,
        scaleY: 1.25,
        translateX: 80,
        translateY: -20,
      },
      state: { scale: 1.25, x: 80, y: -20, sx: 0, sy: 0 },
    };
    saveMindMapBrowserView(draftId, view);
    const document = {
      ...MindMapAdapter.toDocument(MindMapAdapter.createEmpty()),
      data: {
        ...MindMapAdapter.createEmpty(),
        view,
      },
    };

    await saveNewDocument({
      kind: "mindmap",
      name: "Saved Map",
      folderId: "folder-a",
      draftId,
      mindMapDocument: document,
      mindMapThumbnail: "<svg>native</svg>",
    });

    expect(readMindMapBrowserView(draftId)).toBe(null);
    expect(readMindMapBrowserView("server-file")).toEqual(view);
    expect(mocks.discardLocalDraftSession).toHaveBeenCalledWith(draftId);
    expect(mocks.toMindMapLocalCacheRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ view: expect.anything() }),
      }),
      "saved-sha",
    );

    const savedDocument = mocks.saveFileImmediate.mock.calls[0]?.[1] as
      | ReturnType<typeof MindMapAdapter.toDocument>
      | undefined;
    expect(savedDocument?.data).not.toHaveProperty("view");
    expect(savedDocument?.data.root.data.text).toBe("<p>Saved Map</p>");
  });

  it("moves MindMap viewport from document payload when browser storage is empty", async () => {
    const draftId = "local-draft:mindmap-2";
    const view = {
      transform: { scaleX: 1.1, scaleY: 1.1, translateX: 33, translateY: -11 },
      state: { scale: 1.1, x: 33, y: -11, sx: 0, sy: 0 },
    };
    const document = {
      ...MindMapAdapter.toDocument(MindMapAdapter.createEmpty()),
      data: {
        ...MindMapAdapter.createEmpty(),
        view,
      },
    };

    await saveNewDocument({
      kind: "mindmap",
      name: "Saved Map",
      folderId: null,
      draftId,
      mindMapDocument: document,
      mindMapThumbnail: "<svg>native</svg>",
    });

    expect(readMindMapBrowserView(draftId)).toBe(null);
    expect(readMindMapBrowserView("server-file")).toEqual(view);
  });

  it("keeps single-root MindMap viewport clearing outside local-draft promotion", async () => {
    const view = {
      transform: { scaleX: 1, scaleY: 1, translateX: 16, translateY: 24 },
      state: { scale: 1, x: 16, y: 24, sx: 0, sy: 0 },
    };
    saveMindMapBrowserView("server-file", view);

    await saveNewDocument({
      kind: "mindmap",
      name: "Server Map",
      folderId: null,
      mindMapDocument: MindMapAdapter.toDocument(MindMapAdapter.createEmpty()),
      mindMapThumbnail: "<svg>native</svg>",
    });

    expect(readMindMapBrowserView("server-file")).toBe(null);
  });
});
