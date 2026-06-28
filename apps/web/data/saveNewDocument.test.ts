import { beforeEach, describe, expect, it, vi } from "vitest";

import { MindMapAdapter } from "./formats/MindMapAdapter";
import {
  readMindMapBrowserView,
  saveMindMapBrowserView,
} from "./mindMapBrowserViewStorage";
import { saveNewDocument } from "./saveNewDocument";

const mocks = vi.hoisted(() => ({
  discardLocalDraftSession: vi.fn(async () => {}),
  fileSyncState: {
    alignHashes: vi.fn(),
    getBaselineHash: vi.fn(() => "baseline-hash"),
    getServerHash: vi.fn(() => "saved-sha"),
    setLocalCache: vi.fn(),
    setServerHash: vi.fn(),
  },
  generateExcalidrawThumbnailAndCache: vi.fn(async () => "<svg />"),
  generateMindMapThumbnailAndCache: vi.fn(async () => "<svg />"),
  buildAndCacheFileThumbnail: vi.fn(async () => "<svg />"),
  hashDocumentSnapshot: vi.fn(() => "document-hash"),
  hashSceneSnapshot: vi.fn(() => "scene-hash"),
  localThumbnailSet: vi.fn(),
  finalizeSavedThumbnail: vi.fn(),
  promoteRecentCatalogFile: vi.fn(),
  removeLocalDraftFromRecent: vi.fn(),
  saveFileImmediate: vi.fn(async () => ({
    content_sha256: "saved-sha",
  })),
  createFile: vi.fn(async () => ({
    id: "server-file",
    kind: "mindmap",
    name: "server-file",
    content_sha256: "created-sha",
    version: 0,
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

vi.mock("./excalidrawThumbnail", () => ({
  generateExcalidrawThumbnailAndCache:
    mocks.generateExcalidrawThumbnailAndCache,
}));

vi.mock("./mindMapThumbnail", () => ({
  generateMindMapThumbnailAndCache: mocks.generateMindMapThumbnailAndCache,
}));

vi.mock("./thumbnailService", () => ({
  buildAndCacheFileThumbnail: mocks.buildAndCacheFileThumbnail,
}));

vi.mock("./FileSyncState", () => ({
  FileSyncState: mocks.fileSyncState,
}));

vi.mock("./localThumbnailCache", () => ({
  LocalThumbnailCache: {
    get: vi.fn(() => null),
    set: mocks.localThumbnailSet,
  },
}));

vi.mock("./thumbnailLifecycle", () => ({
  finalizeSavedThumbnail: mocks.finalizeSavedThumbnail,
}));

vi.mock("./localDraftSessions", () => ({
  removeLocalDraftFromRecent: mocks.removeLocalDraftFromRecent,
}));

vi.mock("./recentFiles", () => ({
  promoteRecentCatalogFile: mocks.promoteRecentCatalogFile,
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
    mocks.fileSyncState.getServerHash.mockReturnValue("saved-sha");
    mocks.createFile.mockResolvedValue({
      id: "server-file",
      kind: "mindmap",
      name: "server-file",
      content_sha256: "created-sha",
      version: 0,
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

    expect(mocks.removeLocalDraftFromRecent).toHaveBeenCalledWith(draftId);
    expect(mocks.promoteRecentCatalogFile).toHaveBeenCalledWith(
      draftId,
      "server-file",
    );
    expect(readMindMapBrowserView(draftId)).toBe(null);
    expect(readMindMapBrowserView("server-file")).toEqual(view);
    expect(mocks.discardLocalDraftSession).toHaveBeenCalledWith(draftId);
    expect(mocks.toMindMapLocalCacheRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ view: expect.anything() }),
      }),
      "saved-sha",
      0,
    );

    const savedDocument = (
      mocks.saveFileImmediate.mock.calls as unknown[][]
    )[0]?.[1] as ReturnType<typeof MindMapAdapter.toDocument> | undefined;
    expect(savedDocument?.data).not.toHaveProperty("view");
    expect((savedDocument?.data.root.data as { text?: string }).text).toBe(
      "<p>未命名</p>",
    );
  });

  it("does not rewrite a MindMap root node to the first saved file name", async () => {
    const document = MindMapAdapter.toDocument(
      MindMapAdapter.createEmpty("根节点标题"),
    );

    await saveNewDocument({
      kind: "mindmap",
      name: "外部文件名",
      folderId: null,
      mindMapDocument: document,
      mindMapThumbnail: "<svg>native</svg>",
    });

    const savedDocument = (
      mocks.saveFileImmediate.mock.calls as unknown[][]
    )[0]?.[1] as ReturnType<typeof MindMapAdapter.toDocument> | undefined;
    expect((savedDocument?.data.root.data as { text?: string }).text).toBe(
      "<p>根节点标题</p>",
    );
    expect(mocks.saveFileImmediate).toHaveBeenCalledWith(
      "server-file",
      expect.anything(),
      "server-file",
      "<svg>native</svg>",
      { expectedVersion: 0, source: "create" },
    );
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

  it("uses the created file version for the first Excalidraw save", async () => {
    mocks.createFile.mockResolvedValue({
      id: "canvas-file",
      kind: "excalidraw",
      name: "Canvas",
      content_sha256: "created-sha",
      version: 0,
    });

    await saveNewDocument({
      kind: "excalidraw",
      name: "Canvas",
      folderId: null,
      excalidrawScene: {
        elements: [],
        appState: {},
        files: {},
      },
    });

    expect(mocks.saveFileImmediate).toHaveBeenCalledWith(
      "canvas-file",
      expect.objectContaining({
        elements: [],
        files: {},
      }),
      "Canvas",
      "<svg />",
      {
        suppressSavedEvent: true,
        expectedVersion: 0,
        source: "create",
      },
    );
    expect(mocks.finalizeSavedThumbnail).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "canvas-file",
        kind: "excalidraw",
        name: "Canvas",
        contentSha: "saved-sha",
        thumbnail: "<svg />",
      }),
    );
  });

  it("overwrites an existing native save target instead of creating a renamed copy", async () => {
    await saveNewDocument({
      kind: "excalidraw",
      name: "Existing",
      folderId: "folder-a",
      draftId: "local-draft:canvas-1",
      overwriteFile: {
        id: "existing-file",
        kind: "excalidraw",
        name: "Existing",
        folder_id: "folder-a",
        version: 7,
        content_sha256: "existing-sha",
      } as any,
      excalidrawScene: {
        elements: [],
        appState: {},
        files: {},
      },
    });

    expect(mocks.createFile).not.toHaveBeenCalled();
    expect(mocks.saveFileImmediate).toHaveBeenCalledWith(
      "existing-file",
      expect.objectContaining({
        elements: [],
        files: {},
      }),
      "Existing",
      "<svg />",
      {
        suppressSavedEvent: true,
        expectedVersion: 7,
        source: "create",
      },
    );
    expect(mocks.promoteRecentCatalogFile).toHaveBeenCalledWith(
      "local-draft:canvas-1",
      "existing-file",
    );
  });

  it("keeps a blank MindMap root untouched when the filesystem dedupes the file name", async () => {
    mocks.createFile.mockResolvedValue({
      id: "server-file",
      kind: "mindmap",
      name: "未命名 (1)",
      content_sha256: "created-sha",
      version: 0,
    });
    const document = MindMapAdapter.toDocument({
      ...MindMapAdapter.createEmpty(),
      root: {
        data: { text: "<p><br></p>", richText: true, expand: true },
        children: [],
      },
    });

    const saved = await saveNewDocument({
      kind: "mindmap",
      name: " ",
      folderId: null,
      mindMapDocument: document,
      mindMapThumbnail: "<svg>native</svg>",
    });

    expect(saved).toMatchObject({
      id: "server-file",
      kind: "mindmap",
      name: "未命名 (1)",
    });
    expect(mocks.saveFileImmediate).toHaveBeenCalledWith(
      "server-file",
      expect.anything(),
      "未命名 (1)",
      "<svg>native</svg>",
      { expectedVersion: 0, source: "create" },
    );
    expect(mocks.finalizeSavedThumbnail).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "server-file",
        kind: "mindmap",
        name: "未命名 (1)",
        contentSha: "saved-sha",
        thumbnail: "<svg>native</svg>",
      }),
    );
    const savedDocument = (
      mocks.saveFileImmediate.mock.calls as unknown[][]
    )[0]?.[1] as ReturnType<typeof MindMapAdapter.toDocument> | undefined;
    expect((savedDocument?.data.root.data as { text?: string }).text).toBe(
      "<p><br></p>",
    );
  });
});
