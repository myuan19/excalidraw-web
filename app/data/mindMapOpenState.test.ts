import {
  shouldFetchServerAfterCachedMindMapOpen,
  shouldOpenCachedMindMapFirst,
} from "./mindMapOpenState";

describe("MindMap cached open state", () => {
  it("opens from cache first whenever a cached document exists", () => {
    expect(shouldOpenCachedMindMapFirst({ hasCachedDocument: true }))
      .toBe(true);
  });

  it("does not open from cache when no cached document exists", () => {
    expect(shouldOpenCachedMindMapFirst({ hasCachedDocument: false }))
      .toBe(false);
  });

  it("does not fetch full server data after cached open when hashes match", () => {
    expect(
      shouldFetchServerAfterCachedMindMapOpen({
        hasUnsavedChanges: false,
        localServerHash: "sha-a",
        remoteServerHash: "sha-a",
      }),
    ).toBe(false);
  });

  it("fetches full server data after cached open when server hash changed and there is no local draft", () => {
    expect(
      shouldFetchServerAfterCachedMindMapOpen({
        hasUnsavedChanges: false,
        localServerHash: "sha-a",
        remoteServerHash: "sha-b",
      }),
    ).toBe(true);
  });

  it("keeps an unsaved cached draft instead of fetching a newer server document", () => {
    expect(
      shouldFetchServerAfterCachedMindMapOpen({
        hasUnsavedChanges: true,
        localServerHash: "sha-a",
        remoteServerHash: "sha-b",
      }),
    ).toBe(false);
  });
});
