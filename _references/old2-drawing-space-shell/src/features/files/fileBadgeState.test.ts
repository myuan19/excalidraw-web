import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileSyncState } from "@/features/sync/FileSyncState";
import { getFileBadge, getFileBadgeLabel } from "./fileBadgeState";

function installStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  });
  vi.stubGlobal("window", {
    dispatchEvent: vi.fn(),
  });
}

describe("fileBadgeState", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    installStorage();
  });

  it("returns temp for local temp ids", () => {
    expect(getFileBadge("local-temp:test")).toBe("temp");
    expect(getFileBadgeLabel("temp")).toBe("临时");
  });

  it("returns draft for server files with local changes", () => {
    FileSyncState.markOpened("server-a", "base");
    FileSyncState.markDraft("server-a", "draft");
    expect(getFileBadge("server-a")).toBe("draft");
    expect(getFileBadgeLabel("draft")).toBe("未保存");
  });
});
