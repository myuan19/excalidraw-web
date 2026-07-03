import { afterEach, describe, expect, it } from "vitest";

import { LocalThumbnailCache } from "./localThumbnailCache";
import {
  clearAllPersistedThumbnails,
  deletePersistedThumbnail,
  persistSavedThumbnail,
  readAllPersistedThumbnails,
} from "./persistentThumbnailStore";
import {
  resetThumbnailWarmStartForTests,
  warmStartPersistedThumbnails,
} from "./thumbnailWarmStart";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>';

function enableDesktop(): void {
  window.editorHubDesktop = { platform: "win32" };
}

/** persist 是 fire-and-forget：等待微/宏任务队列排空后 IDB 写入可见。 */
async function flushAsync(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("persistentThumbnailStore", () => {
  afterEach(async () => {
    await clearAllPersistedThumbnails();
    resetThumbnailWarmStartForTests();
    sessionStorage.clear();
    localStorage.clear();
    delete (window as Window & { editorHubDesktop?: unknown }).editorHubDesktop;
  });

  it("is a no-op on web (no desktop bridge)", async () => {
    persistSavedThumbnail("file-1", "sha-1", SVG);
    await flushAsync();
    expect(await readAllPersistedThumbnails()).toEqual([]);
  });

  it("persists and reads back contentSha-bound thumbnails on desktop", async () => {
    enableDesktop();
    persistSavedThumbnail("file-1", "sha-1", SVG);
    await flushAsync();

    const entries = await readAllPersistedThumbnails();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      fileId: "file-1",
      contentSha: "sha-1",
      svg: SVG,
    });
  });

  it("skips oversized svg payloads", async () => {
    enableDesktop();
    persistSavedThumbnail("file-1", "sha-1", `<svg>${"x".repeat(200_000)}</svg>`);
    await flushAsync();
    expect(await readAllPersistedThumbnails()).toEqual([]);
  });

  it("removes entries on delete (file deletion path)", async () => {
    enableDesktop();
    persistSavedThumbnail("file-1", "sha-1", SVG);
    await flushAsync();
    deletePersistedThumbnail("file-1");
    await flushAsync();
    expect(await readAllPersistedThumbnails()).toEqual([]);
  });

  it("write-through persists when the saved session slot is bound", async () => {
    enableDesktop();
    LocalThumbnailCache.set("file-2", SVG, { contentSha: "sha-2" });
    await flushAsync();

    const entries = await readAllPersistedThumbnails();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ fileId: "file-2", contentSha: "sha-2" });
  });
});

describe("thumbnailWarmStart", () => {
  afterEach(async () => {
    await clearAllPersistedThumbnails();
    resetThumbnailWarmStartForTests();
    sessionStorage.clear();
    localStorage.clear();
    delete (window as Window & { editorHubDesktop?: unknown }).editorHubDesktop;
    delete window.__EXCALIDRAW_EMBED_MODE__;
  });

  it("restores persisted thumbnails into the session saved slot with one event", async () => {
    enableDesktop();
    persistSavedThumbnail("file-1", "sha-1", SVG);
    await flushAsync();
    // 模拟重启：session 缓存清空，持久层仍在
    sessionStorage.clear();
    resetThumbnailWarmStartForTests();

    let events = 0;
    const onUpdate = () => {
      events += 1;
    };
    window.addEventListener("excalidraw-local-thumb-updated", onUpdate);
    try {
      const restored = await warmStartPersistedThumbnails();
      expect(restored).toBe(1);
      expect(LocalThumbnailCache.getForContent("file-1", "sha-1")).toBe(SVG);
      expect(events).toBe(1);
    } finally {
      window.removeEventListener("excalidraw-local-thumb-updated", onUpdate);
    }
  });

  it("never overwrites a saved slot written during the session", async () => {
    enableDesktop();
    persistSavedThumbnail("file-1", "sha-old", SVG);
    await flushAsync();
    sessionStorage.clear();
    resetThumbnailWarmStartForTests();

    const fresh = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="2"/></svg>';
    LocalThumbnailCache.set("file-1", fresh, { contentSha: "sha-new" });

    await warmStartPersistedThumbnails();
    expect(LocalThumbnailCache.getForContent("file-1", "sha-new")).toBe(fresh);
    expect(LocalThumbnailCache.getForContent("file-1", "sha-old")).toBeNull();
  });

  it("is a no-op in embed mode", async () => {
    enableDesktop();
    persistSavedThumbnail("file-1", "sha-1", SVG);
    await flushAsync();
    sessionStorage.clear();
    resetThumbnailWarmStartForTests();

    window.__EXCALIDRAW_EMBED_MODE__ = true;
    expect(await warmStartPersistedThumbnails()).toBe(0);
    expect(LocalThumbnailCache.getForContent("file-1", "sha-1")).toBeNull();
  });
});
