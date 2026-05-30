import { beforeEach, describe, expect, it, vi } from "vitest";
import { TTDPersistence } from "./ttdPersistence";
import { ServerSync } from "@/services/ServerSync";

function installStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
}

describe("TTDPersistence", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    installStorage();
  });

  it("loads chats from server and mirrors them locally", async () => {
    vi.spyOn(ServerSync, "getTTDChats").mockResolvedValue([{ id: "server" }]);

    await expect(TTDPersistence.loadChats()).resolves.toEqual([{ id: "server" }]);
    expect(localStorage.getItem("drawing-space-ttd-chats")).toContain("server");
  });

  it("falls back to local chats when server load fails", async () => {
    localStorage.setItem("drawing-space-ttd-chats", JSON.stringify([{ id: "local" }]));
    vi.spyOn(ServerSync, "getTTDChats").mockRejectedValue(new Error("offline"));

    await expect(TTDPersistence.loadChats()).resolves.toEqual([{ id: "local" }]);
  });
});
