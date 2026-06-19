import { beforeEach, describe, expect, it, vi } from "vitest";

const { getFile } = vi.hoisted(() => ({
  getFile: vi.fn(),
}));

vi.mock("./ServerSync", () => ({
  ServerSync: {
    getFile,
  },
}));

import { resolveSaveDisplayName } from "./forkFileNaming";

describe("resolveSaveDisplayName", () => {
  beforeEach(() => {
    getFile.mockReset();
  });

  it("uses server metadata as the business document name", async () => {
    getFile.mockResolvedValue({
      id: "file-1",
      name: "未命名",
    });

    await expect(resolveSaveDisplayName("file-1")).resolves.toBe("未命名");
    expect(getFile).toHaveBeenCalledWith("file-1");
  });
});
