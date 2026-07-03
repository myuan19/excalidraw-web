import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("MindMapEditorShell tab cache source contract", () => {
  it("uses unified pane lifecycle and defers native iframe until foreground", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "MindMapEditorShell.tsx"),
      "utf8",
    );
    const bridgeSource = fs.readFileSync(
      path.join(__dirname, "useMindMapHostBridge.ts"),
      "utf8",
    );

    expect(source).toContain("resolvePaneForeground");
    expect(source).toContain("useEditorPaneMountGate");
    expect(source).toContain("mountNativeFrame ? (");
    expect(bridgeSource).toContain("useEditorPaneLifecycle");
    expect(bridgeSource).toContain("onForeground");
    expect(bridgeSource).toContain("onBackground");
    expect(bridgeSource).toContain("sessionEnabled");
    expect(bridgeSource).not.toContain("EDITOR_TAB_STRIP_REORDERED");
    expect(bridgeSource).not.toContain("useEditorTabActivation");
  });

  it("keeps the editor pane stack mounted while the home tab is active", () => {
    const cacheHostSource = fs.readFileSync(
      path.join(__dirname, "../../shell/EditorTabCacheHost.tsx"),
      "utf8",
    );

    // 主页激活时编辑器栈只能 CSS 隐藏、不得卸载：卸载会销毁 iframe 内
    // 未保存的 MindMap 内容与 onPaneBackground 保存链（黄点消失但从未保存）
    expect(cacheHostSource).toContain("const showEditorShell = hasFileTabs;");
    expect(cacheHostSource).not.toContain(
      "const showEditorShell = !showHomePane;",
    );
    expect(cacheHostSource).toContain("{showEditorShell ? (");
  });

  it("flushes the debounced draft cache when the shell unmounts", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "MindMapEditorShell.tsx"),
      "utf8",
    );
    const cleanupBlock = source.slice(
      source.indexOf("// 卸载前把 450ms 防抖中的本地草稿缓存补落盘"),
      source.indexOf("const displayError = error ?? bridgeError;"),
    );

    expect(cleanupBlock).toContain("flushDraft();");
    expect(cleanupBlock).toContain("flushMindMapBrowserView();");
  });
});
