import { describe, expect, it, vi } from "vitest";
import { resolveOpenPayload } from "./openFileSync";

describe("resolveOpenPayload", () => {
  it("opens server data when no local draft exists", () => {
    const result = resolveOpenPayload({
      fileName: "A",
      serverDataText: "{\"server\":true}",
      draft: null,
      serverHash: "server-a",
      hasServerChanged: false,
      confirmChoice: vi.fn(),
    });

    expect(result).toEqual({
      dataText: "{\"server\":true}",
      source: "server",
      clearDraft: false,
    });
  });

  it("asks before restoring a local draft", () => {
    const confirmChoice = vi.fn(() => true);

    const result = resolveOpenPayload({
      fileName: "A",
      serverDataText: "{\"server\":true}",
      draft: { fileId: "file-a", data: "{\"draft\":true}", hash: "draft-a", updatedAt: "now" },
      serverHash: "server-a",
      hasServerChanged: false,
      confirmChoice,
    });

    expect(result.source).toBe("draft");
    expect(result.dataText).toBe("{\"draft\":true}");
    expect(result.clearDraft).toBe(false);
    expect(confirmChoice).toHaveBeenCalledWith(expect.stringContaining("存在未保存本地草稿"));
  });

  it("clears draft when the user chooses the server version", () => {
    const result = resolveOpenPayload({
      fileName: "A",
      serverDataText: "{\"server\":true}",
      draft: { fileId: "file-a", data: "{\"draft\":true}", hash: "draft-a", updatedAt: "now" },
      serverHash: "server-a",
      hasServerChanged: true,
      confirmChoice: vi.fn(() => false),
    });

    expect(result).toEqual({
      dataText: "{\"server\":true}",
      source: "server",
      clearDraft: true,
    });
  });
});
