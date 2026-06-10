import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "../..");

describe("MindMap native source contract", () => {
  it("does not route viewport changes through document saves in takeover mode", () => {
    const source = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/web/src/pages/Edit/components/Edit.vue",
      ),
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
      path.join(
        appRoot,
        "editors/mindmap/native/simple-mind-map/src/utils/index.js",
      ),
      "utf8",
    );
    const renderSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/simple-mind-map/src/core/render/Render.js",
      ),
      "utf8",
    );
    const textEditSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/simple-mind-map/src/core/render/TextEdit.js",
      ),
      "utf8",
    );
    const richTextSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/simple-mind-map/src/plugins/RichText.js",
      ),
      "utf8",
    );
    const pasteSources = [renderSource, textEditSource, richTextSource].join(
      "\n",
    );

    expect(utilsSource).toContain("fitPastedImageSizeToNodeText");
    expect(utilsSource).toContain("Math.min(textWidth, sixCharWidth)");
    expect(
      pasteSources.match(/const imageSize = fitPastedImageSizeToNodeText/g),
    ).toHaveLength(3);
  });

  it("routes text edit save shortcuts through one host save bridge", () => {
    const utilsSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/simple-mind-map/src/utils/index.js",
      ),
      "utf8",
    );
    const textEditSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/simple-mind-map/src/core/render/TextEdit.js",
      ),
      "utf8",
    );
    const richTextSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/simple-mind-map/src/plugins/RichText.js",
      ),
      "utf8",
    );
    const editVueSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/web/src/pages/Edit/components/Edit.vue",
      ),
      "utf8",
    );

    expect(utilsSource).toContain("handleTextEditSaveShortcut");
    expect(utilsSource).toContain(
      "export const handleTextEditSaveShortcut = (e, mindMap)",
    );
    expect(textEditSource).toContain(
      "handleTextEditSaveShortcut(e, this.mindMap)",
    );
    expect(richTextSource).toContain(
      "handleTextEditSaveShortcut(e, this.mindMap)",
    );
    expect(editVueSource).toContain("handleTextEditSaveShortcut: () =>");
    expect(editVueSource).toContain("this.manualSave()");
  });

  it("normalizes pasted text before inserting it into text editors", () => {
    const utilsSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/simple-mind-map/src/utils/index.js",
      ),
      "utf8",
    );
    const richTextSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/simple-mind-map/src/plugins/RichText.js",
      ),
      "utf8",
    );

    expect(utilsSource).toContain("export const normalizePastedText = text =>");
    expect(utilsSource).toContain("replace(/[\\r\\n]+$/, '')");
    expect(utilsSource).toContain("text = normalizePastedText(text)");
    expect(richTextSource).toContain("normalizePastedText");
    expect(richTextSource).toContain("insertPastedText(text)");
    expect(richTextSource).toContain(
      "避免Quill把剪贴板末尾换行转换成额外空段落",
    );
  });

  it("routes host MindMap AI requests through the same-origin server proxy", () => {
    const hostConfigSource = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/useMindMapNativeAIConfig.ts"),
      "utf8",
    );
    const aiRequestSource = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/native/web/src/utils/ai.js"),
      "utf8",
    );
    const aiCreateSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/web/src/pages/Edit/components/AiCreate.vue",
      ),
      "utf8",
    );
    const storeSource = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/native/web/src/store.js"),
      "utf8",
    );

    expect(hostConfigSource).toContain(
      'const MINDMAP_AI_PROXY_ENDPOINT = "/api/mindmap/ai/chat"',
    );
    expect(hostConfigSource).toContain("transport: MINDMAP_AI_PROXY_TRANSPORT");
    expect(hostConfigSource).toContain('key: ""');
    expect(hostConfigSource).not.toContain("key: config.apiKey");
    expect(aiRequestSource).toContain(
      "this.baseData.transport === 'host-proxy'",
    );
    expect(aiRequestSource).toContain(
      "...(isHostProxy ? {} : this.baseData.headers)",
    );
    expect(aiRequestSource).toContain("getResponseErrorMessage");
    expect(aiRequestSource).toContain("json.message || json.error");
    expect(aiCreateSource).toContain(
      "this.aiConfig.transport === 'host-proxy'",
    );
    expect(storeSource).toContain("configured: !!data.configured");
  });

  it("renders sidebar node previews from the selected SVG node only", () => {
    const previewStageSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/web/src/components/sidebar/NodePreviewStage.vue",
      ),
      "utf8",
    );
    const aiSidebarSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/web/src/pages/Edit/components/AiSidebar.vue",
      ),
      "utf8",
    );
    const styleSidebarSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/web/src/pages/Edit/components/Style.vue",
      ),
      "utf8",
    );

    expect(previewStageSource).toContain('class="nodePreviewSvg"');
    expect(previewStageSource).toContain("cloneNode(true)");
    expect(previewStageSource).toContain("node.group.node");
    expect(previewStageSource).toContain(
      ".smm-expand-btn, .smm-quick-create-child-btn",
    );
    expect(previewStageSource).not.toContain(
      ".smm-hover-node, .smm-expand-btn",
    );
    expect(previewStageSource).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(aiSidebarSource).toContain(':node="getPreviewNode()"');
    expect(styleSidebarSource).toContain(':node="getCurrentStyleTargetNode()"');
    expect(aiSidebarSource).not.toContain('class="nodePreviewNode"');
    expect(styleSidebarSource).not.toContain('class="nodePreviewNode"');
  });

  it("keeps AI polish context actions on the sidebar path without the old dialog", () => {
    const aiCreateSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/web/src/pages/Edit/components/AiCreate.vue",
      ),
      "utf8",
    );
    const aiSidebarSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/web/src/pages/Edit/components/AiSidebar.vue",
      ),
      "utf8",
    );
    const contextmenuSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/web/src/pages/Edit/components/Contextmenu.vue",
      ),
      "utf8",
    );
    const toolbarNodeBtnListSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/web/src/pages/Edit/components/ToolbarNodeBtnList.vue",
      ),
      "utf8",
    );

    expect(aiCreateSource).not.toContain("organizeDialogVisible");
    expect(aiCreateSource).not.toContain("aiOrganizeDialog");
    expect(aiCreateSource).not.toContain("showAiOrganizeDialog");
    expect(aiCreateSource).toContain("this.handleSidebarAiOrganize(arg)");
    expect(aiSidebarSource).toContain("focus_ai_prompt");
    expect(contextmenuSource).toContain("this.setActiveSidebar('ai')");
    expect(contextmenuSource).toContain("this.$bus.$emit('focus_ai_prompt')");
    expect(contextmenuSource).not.toContain(
      "this.$bus.$emit('ai_organize_node', this.node)",
    );
    expect(toolbarNodeBtnListSource).toContain("this.setActiveSidebar('ai')");
    expect(toolbarNodeBtnListSource).not.toContain(
      "this.$bus.$emit('ai_organize_node', this.activeNodes[0])",
    );
  });

  it("guides AI rich text away from fake hierarchy indentation", () => {
    const aiCreateSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/web/src/pages/Edit/components/AiCreate.vue",
      ),
      "utf8",
    );
    const aiTreeJsonSource = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/native/web/src/utils/aiTreeJson.js"),
      "utf8",
    );

    expect(aiCreateSource).toContain("禁止把两个 JSON 对象连在同一行");
    expect(aiCreateSource).toContain("parseAiFinalOrganizeResult");
    expect(aiCreateSource).toContain("simpleMindMap 剪贴板 JSON 或整图 JSON");
    expect(aiTreeJsonSource).toContain("parseAiSimpleMindMapJson");
    expect(aiTreeJsonSource).toContain("parseAiFinalOrganizeResult");
    expect(aiCreateSource).toContain(
      "不要用 paragraph.indent 或 span.text 前导空格模拟思维导图层级",
    );
    expect(aiCreateSource).toContain(
      '输出 "Star & Fork"，不要输出 "Star &amp; Fork"',
    );
    expect(aiCreateSource).not.toContain("保留前导空格和连续");
  });

  it("forces AI rich text changes through node size recalculation", () => {
    const aiCreateSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/web/src/pages/Edit/components/AiCreate.vue",
      ),
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
      path.join(
        appRoot,
        "editors/mindmap/native/simple-mind-map/src/plugins/RichText.js",
      ),
      "utf8",
    );

    expect(aiCreateSource).toContain("markAiDataNodeNeedUpdate(uid)");
    expect(aiCreateSource).toContain(
      "targetRef.dataNode.data.needUpdate = true",
    );
    expect(aiCreateSource).toContain("this.markAiDataNodeNeedUpdate(uid)");
    expect(richTextRenderSource).toContain(
      "delete this.nodeData.data.needUpdate",
    );
    expect(richTextPluginSource).toContain(".smm-richtext-node-wrap p");
    expect(richTextPluginSource).toContain("margin: 0;");
  });

  it("commits AI fallback writes through the native history save chain", () => {
    const aiCreateSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/web/src/pages/Edit/components/AiCreate.vue",
      ),
      "utf8",
    );
    const commitHelperBlock = aiCreateSource.slice(
      aiCreateSource.indexOf("commitAiRenderedMutation(reason"),
      aiCreateSource.indexOf("resolveAiOperationRef(ref)"),
    );
    const fallbackBlock = aiCreateSource.slice(
      aiCreateSource.indexOf("applyAiOrganizeResult(result)"),
      aiCreateSource.indexOf("</script>"),
    );

    expect(commitHelperBlock).toContain("this.mindMap.command.addHistory()");
    expect(aiCreateSource).toContain(
      "this.commitAiRenderedMutation('transaction commit'",
    );
    expect(fallbackBlock).toContain(
      "const committed = this.runAiOperationMutation",
    );
    expect(fallbackBlock).toContain(
      "this.commitAiRenderedMutation('fallback commit'",
    );
    expect(fallbackBlock.indexOf("this.mindMap.render()")).toBeLessThan(
      fallbackBlock.indexOf("this.commitAiRenderedMutation('fallback commit'"),
    );
  });
});
