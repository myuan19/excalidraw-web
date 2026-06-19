import { beforeEach, describe, expect, it } from "vitest";

import {
  completeEditorPlatformConfirm,
  requestEditorPlatformConfirm,
} from "./editorPlatformDialog";

describe("editorPlatformDialog", () => {
  beforeEach(() => {
    completeEditorPlatformConfirm("cancel");
  });

  it("resolves with the chosen action", async () => {
    const pending = requestEditorPlatformConfirm({
      title: "测试",
      message: "内容",
      primaryLabel: "确定",
      secondaryLabel: "取消",
    });
    completeEditorPlatformConfirm("primary");
    await expect(pending).resolves.toBe("primary");
  });
});
