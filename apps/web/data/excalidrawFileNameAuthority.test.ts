import { beforeEach, describe, expect, it } from "vitest";

import {
  canonicalizeExcalidrawSceneFileName,
  resolveCanonicalExcalidrawFileName,
} from "./excalidrawFileNameAuthority";
import { writeFileListTreeCache } from "./fileListSessionCache";
import { LocalDraftSessions } from "./localDraftSessions";

describe("excalidrawFileNameAuthority", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("uses local draft session metadata as the draft file name authority", () => {
    LocalDraftSessions.upsert({
      id: "local-draft:excal-name",
      name: "  草稿画布  ",
      kind: "excalidraw",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    expect(resolveCanonicalExcalidrawFileName("local-draft:excal-name")).toBe(
      "草稿画布",
    );
    expect(
      canonicalizeExcalidrawSceneFileName("local-draft:excal-name", {
        elements: [],
        appState: { name: "Native Default" },
        files: {},
      }),
    ).toMatchObject({
      appState: { name: "草稿画布" },
    });
  });

  it("uses the file-list tree cache as the managed file name authority", () => {
    writeFileListTreeCache({
      folders: [],
      files: [
        {
          id: "server-file",
          name: "列表标题",
          kind: "excalidraw",
          folder_id: null,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
          has_thumbnail: false,
          archive_count: 0,
          content_sha256: "sha",
        },
      ],
    });

    expect(resolveCanonicalExcalidrawFileName("server-file")).toBe("列表标题");
    expect(
      canonicalizeExcalidrawSceneFileName("server-file", {
        elements: [],
        appState: { name: "Canvas Payload" },
        files: {},
      }),
    ).toMatchObject({
      appState: { name: "列表标题" },
    });
  });

  it("does not invent a managed file name when metadata is unavailable", () => {
    const scene = {
      elements: [],
      appState: { name: "Canvas Payload" },
      files: {},
    };

    expect(resolveCanonicalExcalidrawFileName("missing-file")).toBe(null);
    expect(canonicalizeExcalidrawSceneFileName("missing-file", scene)).toBe(
      scene,
    );
  });
});
