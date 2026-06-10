import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "../..");

describe("MindMap native source contract", () => {
  it("does not route viewport changes through document saves in takeover mode", () => {
    const source = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/native/web/src/pages/Edit/components/Edit.vue"),
      "utf8",
    );
    const viewChangeBlock = source.slice(
      source.indexOf("this.$bus.$on('view_data_change'"),
      source.indexOf("// 手动保存"),
    );

    expect(viewChangeBlock).toContain("if (window.takeOverApp)");
    expect(viewChangeBlock.indexOf("if (window.takeOverApp)")).toBeLessThan(
      viewChangeBlock.indexOf("storeData({"),
    );
  });

  it("sizes pasted node images through one shared text-width policy", () => {
    const utilsSource = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/native/simple-mind-map/src/utils/index.js"),
      "utf8",
    );
    const renderSource = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/native/simple-mind-map/src/core/render/Render.js"),
      "utf8",
    );
    const textEditSource = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/native/simple-mind-map/src/core/render/TextEdit.js"),
      "utf8",
    );
    const richTextSource = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/native/simple-mind-map/src/plugins/RichText.js"),
      "utf8",
    );
    const pasteSources = [renderSource, textEditSource, richTextSource].join("\n");

    expect(utilsSource).toContain("fitPastedImageSizeToNodeText");
    expect(utilsSource).toContain("Math.min(textWidth, sixCharWidth)");
    expect(
      pasteSources.match(/const imageSize = fitPastedImageSizeToNodeText/g),
    ).toHaveLength(3);
  });

  it("routes text edit save shortcuts through one host save bridge", () => {
    const utilsSource = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/native/simple-mind-map/src/utils/index.js"),
      "utf8",
    );
    const textEditSource = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/native/simple-mind-map/src/core/render/TextEdit.js"),
      "utf8",
    );
    const richTextSource = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/native/simple-mind-map/src/plugins/RichText.js"),
      "utf8",
    );
    const editVueSource = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/native/web/src/pages/Edit/components/Edit.vue"),
      "utf8",
    );

    expect(utilsSource).toContain("handleTextEditSaveShortcut");
    expect(utilsSource).toContain("export const handleTextEditSaveShortcut = (e, mindMap)");
    expect(textEditSource).toContain("handleTextEditSaveShortcut(e, this.mindMap)");
    expect(richTextSource).toContain("handleTextEditSaveShortcut(e, this.mindMap)");
    expect(editVueSource).toContain("handleTextEditSaveShortcut: () =>");
    expect(editVueSource).toContain("this.manualSave()");
  });

  it("keeps AI polish context actions on the sidebar path without the old dialog", () => {
    const aiCreateSource = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/native/web/src/pages/Edit/components/AiCreate.vue"),
      "utf8",
    );
    const aiSidebarSource = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/native/web/src/pages/Edit/components/AiSidebar.vue"),
      "utf8",
    );
    const contextmenuSource = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/native/web/src/pages/Edit/components/Contextmenu.vue"),
      "utf8",
    );
    const toolbarNodeBtnListSource = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/native/web/src/pages/Edit/components/ToolbarNodeBtnList.vue"),
      "utf8",
    );

    expect(aiCreateSource).not.toContain("organizeDialogVisible");
    expect(aiCreateSource).not.toContain("aiOrganizeDialog");
    expect(aiCreateSource).not.toContain("showAiOrganizeDialog");
    expect(aiCreateSource).toContain("this.handleSidebarAiOrganize(arg)");
    expect(aiSidebarSource).toContain("focus_ai_prompt");
    expect(contextmenuSource).toContain("this.setActiveSidebar('ai')");
    expect(contextmenuSource).toContain("this.$bus.$emit('focus_ai_prompt')");
    expect(contextmenuSource).not.toContain("this.$bus.$emit('ai_organize_node', this.node)");
    expect(toolbarNodeBtnListSource).toContain("this.setActiveSidebar('ai')");
    expect(toolbarNodeBtnListSource).not.toContain(
      "this.$bus.$emit('ai_organize_node', this.activeNodes[0])",
    );
  });

  it("guides AI rich text away from fake hierarchy indentation", () => {
    const aiCreateSource = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/native/web/src/pages/Edit/components/AiCreate.vue"),
      "utf8",
    );

    expect(aiCreateSource).toContain(
      "不要用 paragraph.indent 或 span.text 前导空格模拟思维导图层级",
    );
    expect(aiCreateSource).toContain('输出 "Star & Fork"，不要输出 "Star &amp; Fork"');
    expect(aiCreateSource).not.toContain("保留前导空格和连续");
  });

  it("forces AI rich text changes through node size recalculation", () => {
    const aiCreateSource = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/native/web/src/pages/Edit/components/AiCreate.vue"),
      "utf8",
    );
    const richTextRenderSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/simple-mind-map/src/core/render/node/nodeCreateContents.js",
      ),
      "utf8",
    );
    const richTextPluginSource = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/native/simple-mind-map/src/plugins/RichText.js"),
      "utf8",
    );

    expect(aiCreateSource).toContain("markAiDataNodeNeedUpdate(uid)");
    expect(aiCreateSource).toContain("targetRef.dataNode.data.needUpdate = true");
    expect(aiCreateSource).toContain("this.markAiDataNodeNeedUpdate(uid)");
    expect(richTextRenderSource).toContain("delete this.nodeData.data.needUpdate");
    expect(richTextPluginSource).toContain(".smm-richtext-node-wrap p");
    expect(richTextPluginSource).toContain("margin: 0;");
  });
});
