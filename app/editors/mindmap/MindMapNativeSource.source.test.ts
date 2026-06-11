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
      "不要用 paragraph.indent 或 span.text 前导空格模拟思维导图树形层级",
    );
    expect(aiCreateSource).toContain(
      '输出 "Star & Fork"，不要输出 "Star &amp; Fork"',
    );
    const aiRichTextCapabilitySource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/web/src/utils/aiRichTextCapability.js",
      ),
      "utf8",
    );
    expect(aiRichTextCapabilitySource).toContain(
      "是否使用 span.text 行首空格，完全由 user_requirement 决定",
    );
    expect(aiCreateSource).not.toContain("shouldPreserveAiLeadingSpaces");
    expect(aiCreateSource).not.toContain("preserveLeadingSpaces");
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

    const aiNodeMutationSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/web/src/utils/mindMapAiNodeMutation.js",
      ),
      "utf8",
    );
    const aiOperationTransactionSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/web/src/utils/aiOperationTransaction.js",
      ),
      "utf8",
    );
    const aiCommandBridgeSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/web/src/utils/mindMapAiCommandBridge.js",
      ),
      "utf8",
    );
    expect(aiNodeMutationSource).toContain("setNodeDataRender");
    expect(aiNodeMutationSource).not.toContain("INSERT_CHILD_NODE");
    expect(aiNodeMutationSource).not.toContain("REMOVE_NODE");
    expect(aiNodeMutationSource).toContain("markAiDataNodeStale");
    expect(aiOperationTransactionSource).toContain("applyAiUpdateNodeData");
    expect(aiOperationTransactionSource).toContain("applyAiAddChild");
    expect(aiOperationTransactionSource).toContain("mindMapAiCommandBridge");
    expect(aiOperationTransactionSource).not.toMatch(
      /dataNode\.data\[key\]\s*=/,
    );
    expect(aiCommandBridgeSource).toContain("commitMindMapSnapshot");
    expect(richTextRenderSource).toContain(
      "delete this.nodeData.data.needUpdate",
    );
    expect(richTextPluginSource).toContain(".smm-richtext-node-wrap p");
    expect(richTextPluginSource).toContain("margin: 0;");
    expect(richTextRenderSource).toContain("applyRichTextThemeWeightMarker");
    expect(richTextRenderSource).toContain("measureRichTextContent");
    expect(richTextRenderSource).toContain("buildRichTextNodeGroup");
    expect(richTextRenderSource).toContain("computeRichTextFingerprint");
    expect(richTextPluginSource).toContain("RICH_TEXT_SEMANTIC_BOLD_CSS");
    expect(richTextPluginSource).toContain("applyRichTextThemeWeightMarker");
    const richTextFactorySource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/simple-mind-map/src/core/render/richText/richTextContentFactory.js",
      ),
      "utf8",
    );
    const nodeInvalidateSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/simple-mind-map/src/core/render/nodeInvalidate.js",
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
    const baseLayoutSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/simple-mind-map/src/layouts/Base.js",
      ),
      "utf8",
    );
    expect(richTextFactorySource).toContain("cloneNode(true)");
    expect(richTextFactorySource).toContain("measureRichtextNodeTextSizeEl");
    expect(nodeInvalidateSource).toContain("INVALIDATE.TREE_STRUCTURE");
    expect(nodeInvalidateSource).toContain("resolveNodeRefreshPlan");
    expect(renderSource).toContain("markTreeStructureDirty");
    expect(renderSource).toContain("invalidateTextContent");
    expect(renderSource).toContain("createRenderOrchestrator");
    expect(baseLayoutSource).toContain("consumeNodeInvalidation");
    expect(baseLayoutSource).toContain("childStructureChanged");
    expect(aiNodeMutationSource).toContain("markTreeStructureDirty");
    expect(aiNodeMutationSource).toContain("invalidateTextContent");
    const aiPersistCommitSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/web/src/utils/mindMapAiPersistCommit.js",
      ),
      "utf8",
    );
    expect(aiPersistCommitSource).toContain("shouldSkipCommitRender");
  });

  it("isolates drag subtree clones from rich text foreignObject DOM", () => {
    const dragCloneSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/simple-mind-map/src/core/render/drag/dragSubtreeClone.js",
      ),
      "utf8",
    );
    const dragPluginSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/simple-mind-map/src/plugins/Drag.js",
      ),
      "utf8",
    );
    const invalidateSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/simple-mind-map/src/core/render/nodeInvalidate.js",
      ),
      "utf8",
    );
    // 预览克隆保留完整内容（含富文本foreignObject），靠惰性层+类名清扫保证无残留
    expect(dragCloneSource).toContain("root.css('pointer-events', 'none')");
    expect(dragCloneSource).not.toContain("stripForeignObjectsFromClone");
    expect(dragCloneSource).toContain("DRAG_CLONE_ROOT_CLASS");
    expect(dragCloneSource).toContain("disposeDragCloneLayer");
    expect(dragPluginSource).toContain("drag/dragSubtreeClone");
    expect(dragPluginSource).toContain("disposeDragCloneLayer");
    expect(invalidateSource).toContain("markNodeMoveInvalidation");
    expect(invalidateSource).toContain("markTreeStructureInvalidation");
  });

  it("serializes full rebuild renders through one render pass pipeline", () => {
    const renderSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/simple-mind-map/src/core/render/Render.js",
      ),
      "utf8",
    );
    const indexSource = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/native/simple-mind-map/index.js"),
      "utf8",
    );

    // 全量重建作为渲染请求登记，清场动作延迟到渲染pass开始时执行
    expect(indexSource).toContain(
      "this.renderer.requestRender({ full: true })",
    );
    expect(indexSource).not.toContain("this.renderer.reRender = true");
    // 渲染请求-执行分离：pass开始时原子取走请求，期间的请求链式调度
    expect(renderSource).toContain("pendingRenderRequest");
    expect(renderSource).toContain(
      "requestRender({ callback, source, full = false } = {})",
    );
    expect(renderSource).toContain("abortRenderPass");
    expect(renderSource).not.toContain("hasWaitRendering");
    // full pass在开始时清缓存清画布，避免被进行中的渲染重新挂载
    const renderPassBlock = renderSource.slice(
      renderSource.indexOf("_render() {"),
      renderSource.indexOf("renderByCustomNodeContentNode"),
    );
    expect(renderPassBlock).toContain("this.clearCache()");
    expect(renderPassBlock).toContain("this.mindMap.clearDraw()");
    expect(renderPassBlock.indexOf("this.mindMap.clearDraw()")).toBeLessThan(
      renderPassBlock.indexOf("this.lastNodeCache = this.nodeCache"),
    );
    // 插入后编辑队列按uid解析最新实例，避免引用被全量重建替换的旧实例
    expect(renderSource).toContain(
      "this.pendingInsertEditNodes.push(node.uid)",
    );
    expect(renderSource).toContain("const node = this.findNodeByUid(uid)");
  });

  it("keeps realtime text edit rebuilds driven by quill text-change events", () => {
    const richTextSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/simple-mind-map/src/plugins/RichText.js",
      ),
      "utf8",
    );

    // 实时渲染模式依赖初始化text-change重建被TextEdit.show隐藏的SVG文本，
    // 不得拦截程序化text-change（冗余渲染由渲染请求队列收敛）
    expect(richTextSource).not.toContain("suppressTextChange");
    expect(richTextSource).toContain(
      "this.mindMap.emit('node_text_edit_change'",
    );
  });

  it("commits AI fallback writes through the native history save chain", () => {
    const aiCreateSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/web/src/pages/Edit/components/AiCreate.vue",
      ),
      "utf8",
    );
    const aiOperationTransactionSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/web/src/utils/aiOperationTransaction.js",
      ),
      "utf8",
    );
    const aiPersistCommitSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/web/src/utils/mindMapAiPersistCommit.js",
      ),
      "utf8",
    );
    const fallbackBlock = aiCreateSource.slice(
      aiCreateSource.indexOf("applyAiOrganizeResult(result)"),
      aiCreateSource.indexOf("</script>"),
    );

    const renderOrchestratorSource = fs.readFileSync(
      path.join(
        appRoot,
        "editors/mindmap/native/simple-mind-map/src/core/render/renderOrchestrator.js",
      ),
      "utf8",
    );
    expect(aiPersistCommitSource).toContain("mindMapAiCommandBridge");
    expect(aiPersistCommitSource).toContain("commitMindMapSnapshot");
    expect(aiOperationTransactionSource).toContain("commitMindMapAiSession");
    expect(aiOperationTransactionSource).toContain("noteTreeMutation");
    expect(renderOrchestratorSource).toContain("shouldSkipCommitRender");
    expect(aiPersistCommitSource).toContain("emit('data_change'");
    expect(aiCreateSource).toContain("this.commitAiOperationTransaction()");
    expect(aiCreateSource).toContain("applyAiOrganizeResultToMindMap");
    expect(aiCreateSource).not.toContain("commitAiRenderedMutation");
    expect(aiCreateSource).not.toContain("markAiDataNodeNeedUpdate");
    expect(fallbackBlock).toContain(
      "const committed = this.runAiOperationMutation",
    );
    expect(fallbackBlock).toContain("this.commitAiOperationTransaction()");
    expect(fallbackBlock.indexOf("this.mindMap.render()")).toBeLessThan(
      fallbackBlock.indexOf("this.commitAiOperationTransaction()"),
    );
  });
});
