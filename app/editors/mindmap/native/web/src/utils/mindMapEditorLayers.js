/**
 * MindMap 编辑器叠层约定（均在 .editContainer 同一叠层上下文内，自底向上）。
 * 运行时浮层须挂到 overlay 根节点，勿直接 append 到 document.body。
 */

const LAYER_BASE = 10000

export const MINDMAP_CANVAS_Z_INDEX = 1

/** 节点文本编辑框、备注 tooltip 等由 simple-mind-map 动态插入的 DOM */
export const MINDMAP_NODE_TEXT_EDIT_Z_INDEX = LAYER_BASE + 90

/** 右侧属性 / 文本格式等侧栏面板 */
export const SIDEBAR_UI_Z_INDEX_BASE = LAYER_BASE + 100

/** 富文本划选浮动工具栏 */
export const MINDMAP_RICH_TEXT_TOOLBAR_Z_INDEX = LAYER_BASE + 150

export const SIDEBAR_UI_Z_INDEX_TRIGGER = SIDEBAR_UI_Z_INDEX_BASE + 1

export const MINDMAP_OVERLAY_ROOT_CLASS = 'mindMapOverlayRoot'

const CSS_VARS = {
  canvas: '--mm-layer-canvas',
  nodeTextEdit: '--mm-layer-node-text-edit',
  sidebar: '--mm-layer-sidebar',
  richTextToolbar: '--mm-layer-rich-text-toolbar'
}

/** 注入到 .editContainer，供样式表统一引用层级 */
export function getMindMapLayerCssVars() {
  return {
    [CSS_VARS.canvas]: MINDMAP_CANVAS_Z_INDEX,
    [CSS_VARS.nodeTextEdit]: MINDMAP_NODE_TEXT_EDIT_Z_INDEX,
    [CSS_VARS.sidebar]: SIDEBAR_UI_Z_INDEX_BASE,
    [CSS_VARS.richTextToolbar]: MINDMAP_RICH_TEXT_TOOLBAR_Z_INDEX
  }
}

/** MindMap 构造选项：运行时浮层挂载与 z-index */
export function getMindMapRuntimeOverlayOptions(overlayEl) {
  return {
    customInnerElsAppendTo: overlayEl || null,
    nodeTextEditZIndex: MINDMAP_NODE_TEXT_EDIT_Z_INDEX,
    nodeNoteTooltipZIndex: MINDMAP_NODE_TEXT_EDIT_Z_INDEX
  }
}
