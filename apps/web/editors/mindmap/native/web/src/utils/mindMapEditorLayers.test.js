import { describe, expect, it } from 'vitest'

import {
  getMindMapLayerCssVars,
  getMindMapRuntimeOverlayOptions,
  MINDMAP_CANVAS_Z_INDEX,
  MINDMAP_NODE_TEXT_EDIT_Z_INDEX,
  MINDMAP_RICH_TEXT_TOOLBAR_Z_INDEX,
  MINDMAP_TOOLBAR_Z_INDEX,
  SIDEBAR_UI_Z_INDEX_BASE
} from './mindMapEditorLayers'

describe('mindMapEditorLayers', () => {
  it('keeps canvas below text edit below toolbar below sidebar below rich text toolbar', () => {
    expect(MINDMAP_CANVAS_Z_INDEX).toBeLessThan(MINDMAP_NODE_TEXT_EDIT_Z_INDEX)
    expect(MINDMAP_NODE_TEXT_EDIT_Z_INDEX).toBeLessThan(MINDMAP_TOOLBAR_Z_INDEX)
    expect(MINDMAP_TOOLBAR_Z_INDEX).toBeLessThan(SIDEBAR_UI_Z_INDEX_BASE)
    expect(SIDEBAR_UI_Z_INDEX_BASE).toBeLessThan(MINDMAP_RICH_TEXT_TOOLBAR_Z_INDEX)
  })

  it('exposes css vars aligned with layer constants', () => {
    const vars = getMindMapLayerCssVars()
    expect(vars['--mm-layer-canvas']).toBe(MINDMAP_CANVAS_Z_INDEX)
    expect(vars['--mm-layer-node-text-edit']).toBe(MINDMAP_NODE_TEXT_EDIT_Z_INDEX)
    expect(vars['--mm-layer-toolbar']).toBe(MINDMAP_TOOLBAR_Z_INDEX)
    expect(vars['--mm-layer-sidebar']).toBe(SIDEBAR_UI_Z_INDEX_BASE)
    expect(vars['--mm-layer-rich-text-toolbar']).toBe(
      MINDMAP_RICH_TEXT_TOOLBAR_Z_INDEX
    )
  })

  it('builds runtime overlay mindmap options from overlay element', () => {
    const el = document.createElement('div')
    expect(getMindMapRuntimeOverlayOptions(el)).toEqual({
      customInnerElsAppendTo: el,
      nodeTextEditZIndex: MINDMAP_NODE_TEXT_EDIT_Z_INDEX,
      nodeNoteTooltipZIndex: MINDMAP_NODE_TEXT_EDIT_Z_INDEX
    })
    expect(getMindMapRuntimeOverlayOptions(null).customInnerElsAppendTo).toBeNull()
  })
})
