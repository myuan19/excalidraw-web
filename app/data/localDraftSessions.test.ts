import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LocalDraftSessions,
  notifyLocalDraftEdited,
} from "./localDraftSessions";
import {
  getRecentFileEntries,
  RECENT_FILES_KEY,
} from "./recentFiles";

describe("localDraftSessions", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("does not re-add discarded drafts to recent via notifyLocalDraftEdited", () => {
    const draftId = "local-draft:removed";
    LocalDraftSessions.upsert({
      id: draftId,
      name: "Draft",
      kind: "mindmap",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    notifyLocalDraftEdited(draftId);
    expect(getRecentFileEntries().map((entry) => entry.id)).toEqual([draftId]);

    LocalDraftSessions.remove(draftId);
    localStorage.removeItem(RECENT_FILES_KEY);

    notifyLocalDraftEdited(draftId);

    expect(getRecentFileEntries()).toEqual([]);
  });
});
