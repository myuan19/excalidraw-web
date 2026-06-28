import { describe, expect, it } from "vitest";

import { buildServerUpdateConfirmCopy } from "./editorSyncSurface";

describe("buildServerUpdateConfirmCopy", () => {
  it("uses remote-server wording on web", () => {
    const copy = buildServerUpdateConfirmCopy({
      documentName: "Sketch",
      serverVersion: 3,
      mode: "save-conflict",
      surface: "remote-server",
    });

    expect(copy.title).toBe("检测到服务器有更新");
    expect(copy.message).toContain("在服务器上已有新版本（v3）");
    expect(copy.message).toContain("覆盖服务器的新版本");
    expect(copy.secondaryLabel).toBe("载入服务器版本");
  });

  it("uses disk overwrite wording on desktop save conflict", () => {
    const copy = buildServerUpdateConfirmCopy({
      documentName: "未命名",
      mode: "save-conflict",
      surface: "local-folder",
    });

    expect(copy.title).toBe("磁盘文件已更改");
    expect(copy.message).toContain("磁盘文件已被更改");
    expect(copy.message).toContain("继续覆盖将用当前修改写回磁盘");
    expect(copy.primaryLabel).toBe("继续覆盖");
    expect(copy.secondaryLabel).toBe("载入磁盘文件");
  });

  it("uses disk reload wording on desktop cross-tab refresh", () => {
    const copy = buildServerUpdateConfirmCopy({
      mode: "remote-update",
      surface: "local-folder",
    });

    expect(copy.title).toBe("磁盘文件已更改");
    expect(copy.message).toContain("继续编辑将保留当前页面内容");
    expect(copy.primaryLabel).toBe("继续编辑");
    expect(copy.secondaryLabel).toBe("载入磁盘文件");
  });
});
