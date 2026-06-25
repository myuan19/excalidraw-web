import { beforeEach, describe, expect, it } from "vitest";

import {
  LocalDraftSessions,
  notifyLocalDraftEdited,
} from "./localDraftSessions";
import { getRecentFileEntries } from "./recentFiles";

describe("localDraftSessions", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("does not let canvas payload names rename local draft sessions", () => {
    const fileId = "local-draft:test-session";
    LocalDraftSessions.upsert({
      id: fileId,
      name: "临时文档",
      kind: "excalidraw",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    notifyLocalDraftEdited(fileId);

    expect(LocalDraftSessions.get(fileId)?.name).toBe("临时文档");
    expect(LocalDraftSessions.get(fileId)?.updated_at).not.toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });

  it("does not re-add discarded drafts to recent", () => {
    const fileId = "local-draft:discarded";
    LocalDraftSessions.upsert({
      id: fileId,
      name: "临时文档",
      kind: "excalidraw",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    LocalDraftSessions.remove(fileId);

    notifyLocalDraftEdited(fileId);

    expect(getRecentFileEntries().map((entry) => entry.id)).not.toContain(
      fileId,
    );
  });
});
