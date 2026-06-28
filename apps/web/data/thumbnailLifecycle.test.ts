import { afterEach, describe, expect, it, vi } from "vitest";

import { FileSyncState } from "./FileSyncState";
import { FILE_LIST_INCREMENTAL_APPLY_EVENT } from "./fileListIncrementalPatch";
import {
  readFileListTreeCache,
  writeFileListTreeCache,
} from "./fileListSessionCache";
import { LocalThumbnailCache } from "./localThumbnailCache";
import {
  buildThumbnailDraftSlot,
  cacheDraftThumbnailIfVisible,
  finalizeSavedThumbnail,
} from "./thumbnailLifecycle";

import type { ServerFile } from "./ServerSync";

const VISIBLE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>';

function file(overrides: Partial<ServerFile> = {}): ServerFile {
  return {
    id: "file-1",
    name: "测试",
    kind: "excalidraw",
    folder_id: null,
    created_at: "2026-06-22T00:00:00.000Z",
    updated_at: "2026-06-22T00:00:00.000Z",
    has_thumbnail: false,
    content_sha256: "server-sha",
    ...overrides,
  } as ServerFile;
}

describe("thumbnailLifecycle", () => {
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("treats newer local edits as a draft thumbnail slot", () => {
    vi.setSystemTime(new Date("2026-06-22T00:01:00.000Z"));
    FileSyncState.setBaselineHash("file-1", "server-sha");
    FileSyncState.setDraftHash("file-1", "server-sha");
    FileSyncState.setLocalEditTime("file-1");

    const slot = buildThumbnailDraftSlot(file());
    expect(slot.syncState).toBe("draft");
    expect(slot.listLocalPolicy).toBe("last-saved-until-sync");
  });

  it("keeps list thumb on saved slot while draft preview updates", () => {
    vi.setSystemTime(new Date("2026-06-22T00:01:00.000Z"));
    LocalThumbnailCache.bindToContentSha("file-1", "server-sha", VISIBLE_SVG);
    FileSyncState.setBaselineHash("file-1", "server-sha");
    FileSyncState.setDraftHash("file-1", "draft-hash");
    FileSyncState.setLocalEditTime("file-1");
    cacheDraftThumbnailIfVisible("file-1", "mindmap", VISIBLE_SVG, "draft-hash");

    const slot = buildThumbnailDraftSlot(
      file({ kind: "mindmap", content_sha256: "server-sha" }),
    );
    expect(slot.syncState).toBe("draft");
    expect(slot.listLocalPolicy).toBe("last-saved-until-sync");
    expect(slot.listLocalThumb).toBe(VISIBLE_SVG);
    expect(slot.localDraftThumb).toBe(VISIBLE_SVG);
  });

  it("caches draft thumbnails only when visible and bound to the draft hash", () => {
    expect(
      cacheDraftThumbnailIfVisible("file-1", "excalidraw", VISIBLE_SVG, "h1"),
    ).toBe(VISIBLE_SVG);

    expect(LocalThumbnailCache.getForDraft("file-1", "h1")).toBe(VISIBLE_SVG);
    expect(LocalThumbnailCache.getForDraft("file-1", "h2")).toBeNull();
  });

  it("finalizes saved thumbnails and patches the file-list cache", () => {
    writeFileListTreeCache({ folders: [], files: [file()] });
    const incrementalEvents: string[] = [];
    window.addEventListener(FILE_LIST_INCREMENTAL_APPLY_EVENT, (event) => {
      incrementalEvents.push(
        (event as CustomEvent<{ fileId?: string }>).detail?.fileId ?? "",
      );
    });

    expect(
      finalizeSavedThumbnail({
        fileId: "file-1",
        kind: "mindmap",
        name: "保存后",
        contentSha: "sha-saved",
        version: 3,
        updatedAt: "2026-06-22T00:02:00.000Z",
        thumbnail: VISIBLE_SVG,
      }),
    ).toBe(VISIBLE_SVG);

    expect(incrementalEvents).toEqual(["file-1"]);
    expect(LocalThumbnailCache.getForContent("file-1", "sha-saved")).toBe(
      VISIBLE_SVG,
    );
    expect(readFileListTreeCache()?.files[0]).toMatchObject({
      name: "保存后",
      kind: "mindmap",
      has_thumbnail: true,
      content_sha256: "sha-saved",
      version: 3,
    });
  });
});
