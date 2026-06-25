import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  restoreSnapshot: vi.fn(async () => {}),
  setFileId: vi.fn(async () => {}),
}));

vi.mock("./DeltaStorage", () => ({
  DeltaStorage: {
    setFileId: mocks.setFileId,
    restoreSnapshot: mocks.restoreSnapshot,
  },
}));

vi.mock("./FileSyncState", () => ({
  FileSyncState: {
    clearLocalCache: vi.fn(),
    clearHashStateForFile: vi.fn(),
    clearLocalEditTime: vi.fn(),
  },
}));

vi.mock("./localDraftSessions", () => ({
  LocalDraftSessions: {
    remove: vi.fn(),
  },
  removeLocalDraftFromRecent: vi.fn(),
}));

vi.mock("./localThumbnailCache", () => ({
  LocalThumbnailCache: {
    clear: vi.fn(),
  },
}));

import {
  readMindMapBrowserView,
  saveMindMapBrowserView,
} from "./mindMapBrowserViewStorage";
import { discardLocalDraftSession } from "./discardLocalDraftSession";

describe("discardLocalDraftSession", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("clears MindMap browser view storage for discarded local drafts", async () => {
    const draftId = "local-draft:discard-me";
    saveMindMapBrowserView(draftId, {
      transform: { scaleX: 1, scaleY: 1, translateX: 12, translateY: -6 },
      state: { scale: 1, x: 12, y: -6, sx: 0, sy: 0 },
    });

    await discardLocalDraftSession(draftId);

    expect(readMindMapBrowserView(draftId)).toBe(null);
  });
});
