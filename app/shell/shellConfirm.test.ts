import { describe, expect, it } from "vitest";

import {
  completeEditorPlatformConfirm,
  requestEditorPlatformConfirm,
} from "./editorPlatformDialog";
import { requestDestructiveConfirm } from "./shellConfirm";

describe("requestDestructiveConfirm", () => {
  it("resolves true when primary is chosen", async () => {
    const pending = requestDestructiveConfirm({
      title: "删除",
      message: "确定？",
      confirmLabel: "删除",
    });
    completeEditorPlatformConfirm("primary");
    await expect(pending).resolves.toBe(true);
  });

  it("resolves false when cancelled", async () => {
    const pending = requestDestructiveConfirm({
      title: "删除",
      message: "确定？",
    });
    completeEditorPlatformConfirm("cancel");
    await expect(pending).resolves.toBe(false);
  });

  it("resolves false when a confirm is already pending", async () => {
    requestEditorPlatformConfirm({
      title: "占用",
      message: "…",
      primaryLabel: "确定",
    });
    await expect(
      requestDestructiveConfirm({ title: "删除", message: "…" }),
    ).resolves.toBe(false);
    completeEditorPlatformConfirm("cancel");
  });
});
