import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nativeWebRoot = path.join(__dirname, "native", "web");
const nativeRoot = path.join(__dirname, "native");

function readNativeSource(relativePath: string): string {
  return fs.readFileSync(path.join(nativeWebRoot, relativePath), "utf8");
}

describe("MindMap iframe save contract", () => {
  it("takeoverShell syncs text edit non-destructively before snapshot and skips draft while editing", () => {
    const bridge = readNativeSource("src/bridge/takeoverShell.js");

    // 前台保存/缩略图快照不得关闭编辑框（会把 Tab 新建节点踢出编辑/选中态），
    // 只允许 syncEditingTextToNode 非破坏式落盘编辑中的文本；pane 后台 /
    // 页面隐藏时语义相反：用户已离开编辑器，必须提交式结束编辑
    // （hideEditTextBox）保证保存链拿到编辑框真实内容，否则保存旧数据清掉
    // 黄点后 pane 休眠，编辑框未落库文字随卸载丢失（切回后修改全部消失）。
    expect(bridge).toContain("syncEditingTextToNodeForSnapshot");
    expect(bridge).toContain("!hostPaneForeground || isDocumentHidden()");
    expect(bridge).toContain("snapshot.commitTextEdit.background");
    expect(bridge).toContain("mindMapPaneVisibility");
    expect(bridge).toContain("textEdit.commitOnBackground");
    expect(bridge).toContain("takeOverApp.saveMindMapData.skippedWhileEditing");
    expect(bridge).not.toContain("const resolved = snapshot || data");
    expect(bridge.indexOf("syncEditingTextToNodeForSnapshot")).toBeLessThan(
      bridge.indexOf("getDataForSnapshot"),
    );
  });

  it("exports thumbnails without closing text edit or keeping selection state", () => {
    const bridge = readNativeSource("src/bridge/takeoverShell.js");
    const exportPlugin = fs.readFileSync(
      path.join(nativeRoot, "simple-mind-map", "src", "plugins", "Export.js"),
      "utf8",
    );

    expect(bridge).toContain("preserveTextEdit: true");
    expect(bridge).toContain("removeActiveState: true");
    // preserveTextEdit 分支：同步文本，并给活画布上正在编辑的文本打标记，克隆后
    // 在导出副本上恢复 display+opacity（realtime 编辑态用 opacity:0 隐藏正在编辑
    // 节点的文本，仅恢复 display 会漏掉它 → 缩略图该节点空白）
    expect(exportPlugin).toContain("await textEdit.syncEditingTextToNode()");
    expect(exportPlugin).toContain("getCurrentEditNode");
    expect(exportPlugin).toContain("EXPORT_EDIT_TEXT_MARK");
    expect(exportPlugin).toContain("item.attr('opacity', 1)");
    expect(exportPlugin).toContain("item.css('display', '')");
    expect(exportPlugin).toContain("removeClass('active')");
    expect(exportPlugin).toContain("removeClass('smm-node-highlight')");
  });

  it("keeps background saves alive while the document is hidden", () => {
    const bridge = readNativeSource("src/bridge/takeoverShell.js");
    const paneBoost = fs.readFileSync(
      path.join(__dirname, "mindMapNativeSavePaneBoost.ts"),
      "utf8",
    );
    const shell = fs.readFileSync(
      path.join(__dirname, "MindMapEditorShell.tsx"),
      "utf8",
    );

    // 隐藏页 rAF 完全暂停：帧等待必须有定时器竞速兜底，否则保存链永久挂起
    // （后台自动保存 15s 超时反复失败的根因）
    expect(bridge).toContain("const isDocumentHidden = ()");
    expect(bridge).toContain("window.setTimeout(finish, 250)");
    // 隐藏页只保数据：跳过强制渲染与缩略图导出，回到可见后补跑
    expect(bridge).toContain("thumbnailExport.skippedWhileHidden");
    expect(bridge).toContain("ensureTextRendered.skippedWhileHidden");
    expect(bridge).toContain("thumbnailExport.resumeAfterVisible");
    expect(bridge).toContain("!isDocumentHidden()");
    // 宿主侧 paneBoost 帧等待同样不得依赖 rAF 独自兑现
    expect(paneBoost).toContain("window.setTimeout(finish, 150)");
    // onPaneBackground 的立即保存先于 requestNativeSaveRef 同步 effect，
    // 必须读 ref 拿真实前后台状态，否则漏掉后台 pane 的可见性 boost
    expect(shell).toContain("isPaneForegroundRef.current");
    expect(shell).toContain("paneForegroundAtRequest");
  });

  it("defers heavy native work while a drag interaction is active", () => {
    const bridge = readNativeSource("src/bridge/takeoverShell.js");
    const shell = fs.readFileSync(
      path.join(__dirname, "MindMapEditorShell.tsx"),
      "utf8",
    );

    expect(bridge).toContain("postToHost('mindMapInteractionState'");
    expect(bridge).toContain("runWhenDragIdle");
    expect(bridge).toContain("waitForDragIdle");
    expect(bridge).toContain("draftThumbnailExport.deferredWhileDragging");
    expect(bridge).toContain("'wait-drag-idle'");
    expect(bridge).toContain("nativeMindMap.on('node_dragging'");
    expect(bridge).toContain("nativeMindMap.on('node_dragend'");
    expect(shell).toContain('event.data.type === "mindMapInteractionState"');
    expect(shell).toContain("setMindMapNativeDragging");
    expect(shell).toContain("runAfterMindMapNativeDrag(fireAutoSaveTimer)");
  });

  it("guards native highlight rendering when svg polygon is unavailable", () => {
    const render = fs.readFileSync(
      path.join(
        nativeRoot,
        "simple-mind-map",
        "src",
        "core",
        "render",
        "Render.js",
      ),
      "utf8",
    );

    expect(render).toContain(
      "typeof this.highlightBoxNode.plot !== 'function'",
    );
    expect(render).toContain("highlightNode skipped");
    expect(render).toContain("invalid-bounds");
  });

  it("logs host-side native save progress and iframe failures", () => {
    const shell = fs.readFileSync(
      path.join(__dirname, "MindMapEditorShell.tsx"),
      "utf8",
    );

    expect(shell).toContain('event.data.type === "mindMapSaveProgress"');
    expect(shell).toContain('"mindmap-native"');
    expect(shell).toContain('"saveProgress"');
    expect(shell).toContain('"iframeError"');
    expect(shell).toContain('"queueAutoSave.timerFired"');
    expect(shell).toContain('"persistServer"');
  });
});
