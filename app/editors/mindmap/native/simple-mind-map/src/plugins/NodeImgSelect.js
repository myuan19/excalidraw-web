// 图片选中管理插件
// 实现：单击选中节点后再点击图片 → 选中图片 → 蓝色边框 + 右下角缩放手柄
// 缩放逻辑内置，不依赖 NodeImgAdjust
import { resizeImgSizeByOriginRatio } from '../utils/index'

const DBG = (...args) => console.log('[DEBUG] NodeImgSelect |', ...args)
const RESIZE_EVENT_CAPTURE = true
const Z_INDEX = {
  highlight: 9999,
  placementOverlay: 9998
}

class NodeImgSelect {
  constructor({ mindMap }) {
    this.mindMap = mindMap
    this.selectedNode = null
    this.selectedImgNode = null
    this.isImgSelected = false
    this.highlightEl = null
    this.resizeDotEl = null

    // 拖拽调整位置
    this.isDraggingPlacement = false
    this._dragPending = false
    this._justFinishedDrag = false
    this.dragStartX = 0
    this.dragStartY = 0
    this.dragTargetNode = null
    this.dragPlacementOverlay = null
    this._previewTimer = null
    this._suppressDeselectUntil = 0
    this._suppressDeselectReason = ''

    // 缩放状态
    this._isResizing = false
    this._resizeRect = null
    this._resizeTransform = null
    this._resizeOffset = { x: 0, y: 0 }
    this._resizeW = 0
    this._resizeH = 0
    this._resizeOriginalImageSize = null
    this._lastResizeMoveDebugAt = 0
    this._resizeRenderFrame = null
    this._resizeRenderPending = false

    this.bindEvent()
  }

  bindEvent() {
    this.onNodeImgClick = this.onNodeImgClick.bind(this)
    this.onDrawClick = this.onDrawClick.bind(this)
    this.onSvgMousedown = this.onSvgMousedown.bind(this)
    this.onNodeClick = this.onNodeClick.bind(this)
    this.onNodeDblclick = this.onNodeDblclick.bind(this)
    this.onNodeActive = this.onNodeActive.bind(this)
    this.onKeydown = this.onKeydown.bind(this)
    this.onScale = this.onScale.bind(this)
    this.onTranslate = this.onTranslate.bind(this)
    this.onRenderEnd = this.onRenderEnd.bind(this)
    this.onNodeImgContextmenu = this.onNodeImgContextmenu.bind(this)
    this.onNodeImgMousedown = this.onNodeImgMousedown.bind(this)
    this.onMousemove = this.onMousemove.bind(this)

    this._onCanvasMouseup = (e) => { this.handleMouseup(e) }
    this._onNodeMouseup = (_node, e) => { this.handleMouseup(e) }

    this._boundResizeMove = (e) => this._onResizeMove(e)
    this._boundResizeUp = (e) => this._onResizeUp(e, 'mouseup')
    this._boundResizeCancel = (e) => this._onResizeUp(e, 'window-blur')
    this._boundVisibilityChange = () => {
      if (document.hidden) this._onResizeUp(null, 'visibility-hidden')
    }
    this._boundDocumentMousedownCapture = (e) => {
      this.onDocumentMousedownCapture(e)
    }

    this.mindMap.on('node_img_click', this.onNodeImgClick)
    this.mindMap.on('draw_click', this.onDrawClick)
    this.mindMap.on('svg_mousedown', this.onSvgMousedown)
    this.mindMap.on('node_click', this.onNodeClick)
    this.mindMap.on('node_dblclick', this.onNodeDblclick)
    this.mindMap.on('node_active', this.onNodeActive)
    this.mindMap.on('scale', this.onScale)
    this.mindMap.on('translate', this.onTranslate)
    this.mindMap.on('node_tree_render_end', this.onRenderEnd)
    this.mindMap.on('node_img_contextmenu', this.onNodeImgContextmenu)
    this.mindMap.on('node_img_mousedown', this.onNodeImgMousedown)
    this.mindMap.on('mousemove', this.onMousemove)
    this.mindMap.on('mouseup', this._onCanvasMouseup)
    this.mindMap.on('node_mouseup', this._onNodeMouseup)

    document.addEventListener('keydown', this.onKeydown, true)
    document.addEventListener('mousedown', this._boundDocumentMousedownCapture, true)
  }

  unBindEvent() {
    this.mindMap.off('node_img_click', this.onNodeImgClick)
    this.mindMap.off('draw_click', this.onDrawClick)
    this.mindMap.off('svg_mousedown', this.onSvgMousedown)
    this.mindMap.off('node_click', this.onNodeClick)
    this.mindMap.off('node_dblclick', this.onNodeDblclick)
    this.mindMap.off('node_active', this.onNodeActive)
    this.mindMap.off('scale', this.onScale)
    this.mindMap.off('translate', this.onTranslate)
    this.mindMap.off('node_tree_render_end', this.onRenderEnd)
    this.mindMap.off('node_img_contextmenu', this.onNodeImgContextmenu)
    this.mindMap.off('node_img_mousedown', this.onNodeImgMousedown)
    this.mindMap.off('mousemove', this.onMousemove)
    this.mindMap.off('mouseup', this._onCanvasMouseup)
    this.mindMap.off('node_mouseup', this._onNodeMouseup)

    document.removeEventListener('keydown', this.onKeydown, true)
    document.removeEventListener('mousedown', this._boundDocumentMousedownCapture, true)
    this._removeResizeListeners()
  }

  // ====== 缩放 ======

  _stopMouseEvent(e, reason) {
    if (!e) return
    try {
      e.preventDefault()
      e.stopPropagation()
    } catch (err) {
      DBG('_stopMouseEvent | failed:', reason, err)
    }
  }

  _resetCoreMouseState(reason) {
    const evtObj = this.mindMap.event
    if (evtObj) {
      evtObj.isLeftMousedown = false
      evtObj.isMiddleMousedown = false
      evtObj.isRightMousedown = false
    }
    const drag = this.mindMap.drag
    if (drag && (drag.isMousedown || drag.isDragging)) {
      DBG(
        '_resetCoreMouseState | reset drag plugin:',
        reason,
        '| isMousedown:',
        drag.isMousedown,
        '| isDragging:',
        drag.isDragging
      )
      if (drag.isDragging) {
        try {
          drag.beingDragNodeList.forEach(node => {
            node.setOpacity(1)
            node.showChildren()
            node.endDrag()
          })
          drag.removeCloneNode()
        } catch (err) {
          DBG('_resetCoreMouseState | drag cleanup failed:', err)
        }
      }
      drag.reset()
    }
  }

  _addResizeListeners() {
    this._removeResizeListeners()
    window.addEventListener('mousemove', this._boundResizeMove, RESIZE_EVENT_CAPTURE)
    window.addEventListener('mouseup', this._boundResizeUp, RESIZE_EVENT_CAPTURE)
    document.addEventListener('mouseup', this._boundResizeUp, RESIZE_EVENT_CAPTURE)
    window.addEventListener('blur', this._boundResizeCancel, RESIZE_EVENT_CAPTURE)
    document.addEventListener('visibilitychange', this._boundVisibilityChange)
  }

  _removeResizeListeners() {
    window.removeEventListener('mousemove', this._boundResizeMove, RESIZE_EVENT_CAPTURE)
    window.removeEventListener('mouseup', this._boundResizeUp, RESIZE_EVENT_CAPTURE)
    document.removeEventListener('mouseup', this._boundResizeUp, RESIZE_EVENT_CAPTURE)
    window.removeEventListener('blur', this._boundResizeCancel, RESIZE_EVENT_CAPTURE)
    document.removeEventListener('visibilitychange', this._boundVisibilityChange)
  }

  _cancelResizeRenderFrame() {
    if (this._resizeRenderFrame == null) return
    const cancel =
      typeof window !== 'undefined' && window.cancelAnimationFrame
        ? window.cancelAnimationFrame.bind(window)
        : clearTimeout
    cancel(this._resizeRenderFrame)
    this._resizeRenderFrame = null
    this._resizeRenderPending = false
  }

  _scheduleResizeRender() {
    if (this._resizeRenderPending) return
    this._resizeRenderPending = true
    const schedule =
      typeof window !== 'undefined' && window.requestAnimationFrame
        ? window.requestAnimationFrame.bind(window)
        : fn => setTimeout(fn, 16)
    this._resizeRenderFrame = schedule(() => {
      this._resizeRenderFrame = null
      this._resizeRenderPending = false
      if (!this.selectedNode) return
      this.mindMap.render(() => {
        if (
          this.selectedNode &&
          this.selectedNode._imgData &&
          this.selectedNode._imgData.node
        ) {
          this.selectedImgNode = this.selectedNode._imgData.node
        }
        if (this.isImgSelected && !this._isResizing) {
          this.updateHighlightPos()
        }
      })
    })
  }

  getSelectedImageUrl() {
    if (!this.selectedNode) return ''
    if (typeof this.selectedNode.getImageUrl === 'function') {
      return this.selectedNode.getImageUrl() || ''
    }
    const img = this.selectedNode.getData('image') || ''
    const imgMap =
      (this.mindMap.renderer &&
        this.mindMap.renderer.renderTree &&
        this.mindMap.renderer.renderTree.data &&
        this.mindMap.renderer.renderTree.data.imgMap) ||
      {}
    return imgMap[img] || img
  }

  _startResize(e) {
    if (!this.selectedNode || !this.selectedImgNode) {
      DBG('_startResize | abort: no selectedNode/ImgNode')
      return
    }
    // 防止重复启动 — 先清理可能残留的旧监听
    this._removeResizeListeners()

    this._isResizing = true
    try {
      this._resizeRect = this.selectedImgNode.rbox()
    } catch (err) {
      DBG('_startResize | rbox() failed:', err)
      this._isResizing = false
      return
    }
    this._resizeTransform = this.mindMap.draw.transform()
    this._resizeOffset.x = e.clientX - (this._resizeRect.x + this._resizeRect.width)
    this._resizeOffset.y = e.clientY - (this._resizeRect.y + this._resizeRect.height)
    this._resizeW = this._resizeRect.width
    this._resizeH = this._resizeRect.height

    this._stopMouseEvent(e, '_startResize')
    this._resetCoreMouseState('_startResize')

    const imageSize = this.selectedNode.getData('imageSize')
    this._resizeOriginalImageSize = imageSize ? { ...imageSize } : null

    DBG('_startResize | rect:', JSON.stringify(this._resizeRect),
        '| originalImageSize:', this._resizeOriginalImageSize
          ? JSON.stringify(this._resizeOriginalImageSize)
          : 'none',
        '| imgUrl length:', this.getSelectedImageUrl().length)

    this._addResizeListeners()
  }

  _onResizeMove(e) {
    if (!this._isResizing) return
    this._stopMouseEvent(e, '_onResizeMove')

    // 持续阻止 mind map 的 drag 标志
    this._resetCoreMouseState('_onResizeMove')

    const { scaleX, scaleY } = this._resizeTransform
    const imgSize =
      this._resizeOriginalImageSize || this.selectedNode.getData('imageSize')
    if (!imgSize) {
      DBG('_onResizeMove | no imageSize data')
      return
    }
    const { width: originW, height: originH } = imgSize
    let {
      minImgResizeWidth,
      minImgResizeHeight,
      maxImgResizeWidthInheritTheme,
      maxImgResizeWidth,
      maxImgResizeHeight
    } = this.mindMap.opt

    const minR = minImgResizeWidth / minImgResizeHeight
    const oR = originW / originH
    if (minR > oR) {
      minImgResizeHeight = minImgResizeWidth / oR
    } else {
      minImgResizeWidth = minImgResizeHeight * oR
    }

    let imgMaxW, imgMaxH
    if (maxImgResizeWidthInheritTheme) {
      imgMaxW = this.mindMap.getThemeConfig('imgMaxWidth')
      imgMaxH = this.mindMap.getThemeConfig('imgMaxHeight')
    } else {
      imgMaxW = maxImgResizeWidth
      imgMaxH = maxImgResizeHeight
    }
    imgMaxW *= scaleX
    imgMaxH *= scaleY

    let nw = Math.abs(e.clientX - this._resizeRect.x - this._resizeOffset.x)
    let nh = Math.abs(e.clientY - this._resizeRect.y - this._resizeOffset.y)
    if (nw < minImgResizeWidth) nw = minImgResizeWidth
    if (nh < minImgResizeHeight) nh = minImgResizeHeight
    if (nw > imgMaxW) nw = imgMaxW
    if (nh > imgMaxH) nh = imgMaxH

    const [actW, actH] = resizeImgSizeByOriginRatio(originW, originH, nw, nh)
    this._resizeW = actW
    this._resizeH = actH

    const now = Date.now()
    if (now - this._lastResizeMoveDebugAt > 120) {
      this._lastResizeMoveDebugAt = now
      DBG('_onResizeMove | sample | client:', e.clientX, e.clientY,
          '| rawSize:', nw, 'x', nh,
          '| actualSize:', actW, 'x', actH,
          '| scale:', scaleX, scaleY,
          '| min:', minImgResizeWidth, minImgResizeHeight,
          '| max:', imgMaxW, imgMaxH)
    }

    this.applyLiveResize(actW / scaleX, actH / scaleY)

    // 同步更新蓝色边框
    if (this.highlightEl) {
      this.highlightEl.style.width = actW + 'px'
      this.highlightEl.style.height = actH + 'px'
    }
  }

  _onResizeUp(e, reason = 'mouseup') {
    DBG('_onResizeUp | reason:', reason,
        '| isResizing:', this._isResizing,
        '| resizeW:', this._resizeW, '| resizeH:', this._resizeH,
        '| client:', e ? `${e.clientX},${e.clientY}` : 'none')
    if (!this._isResizing) return
    this._stopMouseEvent(e, '_onResizeUp')
    this._removeResizeListeners()
    this._resetCoreMouseState('_onResizeUp')

    // 应用新尺寸
    if (this.selectedNode && this._resizeRect) {
      const { scaleX, scaleY } = this._resizeTransform || { scaleX: 1, scaleY: 1 }
      const newW = this._resizeW / scaleX
      const newH = this._resizeH / scaleY
      const oldW = this._resizeRect.width / scaleX
      const oldH = this._resizeRect.height / scaleY
      const dw = Math.abs(newW - oldW)
      const dh = Math.abs(newH - oldH)
      DBG('_onResizeUp | old:', oldW, 'x', oldH,
          '| new:', newW, 'x', newH,
          '| delta w:', dw, '| delta h:', dh,
          '| nodeUid:', this.selectedNode && this.selectedNode.uid)
      if (dw > 1 || dh > 1) {
        const { image, imageTitle } = this.selectedNode.getData()
        try {
          DBG('_onResizeUp | exec SET_NODE_IMAGE | image length:',
              image ? String(image).length : 0,
              '| title:', imageTitle || '',
              '| custom:', true)
          this.mindMap.execCommand('SET_NODE_IMAGE', this.selectedNode, {
            url: image,
            title: imageTitle,
            width: newW,
            height: newH,
            custom: true
          })
          this.mindMap.render(() => {
            DBG('_onResizeUp | forced render callback | nodeUid:',
                this.selectedNode && this.selectedNode.uid,
                '| hasSelectedImgNode:', !!this.selectedImgNode)
            if (
              this.selectedNode &&
              this.selectedNode._imgData &&
              this.selectedNode._imgData.node
            ) {
              this.selectedImgNode = this.selectedNode._imgData.node
            }
            this.updateHighlightPos()
            this.showHighlight()
          })
          DBG('_onResizeUp | applied new size:', newW, 'x', newH)
        } catch (err) {
          DBG('_onResizeUp | execCommand failed:', err)
        }
      } else {
        DBG('_onResizeUp | size unchanged, skip command')
      }
    }

    this._isResizing = false
    this._cancelResizeRenderFrame()
    this.suppressDeselect('resize-up', 300)
    this._resizeTransform = null
    this._resizeRect = null
    this._resizeOriginalImageSize = null
    this._resizeOffset.x = 0
    this._resizeOffset.y = 0
  }

  applyLiveResize(width, height) {
    if (!this.selectedNode) {
      DBG('applyLiveResize | abort: no selectedNode')
      return
    }
    const nodeData = this.selectedNode.nodeData && this.selectedNode.nodeData.data
    if (!nodeData) {
      DBG('applyLiveResize | abort: no node data')
      return
    }
    nodeData.imageSize = {
      ...(nodeData.imageSize || {}),
      width,
      height,
      custom: true
    }
    try {
      const changed = this.selectedNode.reRender(['image'])
      if (changed) {
        this._scheduleResizeRender()
      } else if (
        this.selectedNode._imgData &&
        this.selectedNode._imgData.node
      ) {
        this.selectedImgNode = this.selectedNode._imgData.node
        if (!this._isResizing) {
          this.updateHighlightPos()
        }
      }
    } catch (err) {
      DBG('applyLiveResize | reRender failed:', err)
    }
    const now = Date.now()
    if (now - this._lastResizeMoveDebugAt > 120) {
      DBG('applyLiveResize | sample | nodeUid:',
          this.selectedNode && this.selectedNode.uid,
          '| logicalSize:', width, 'x', height,
          '| nodeSize:', this.selectedNode.width, 'x', this.selectedNode.height,
          '| hasSelectedImgNode:', !!this.selectedImgNode)
    }
  }

  // ====== 图片点击 ======

  onNodeImgClick(node, imgNode, e) {
    if (this.mindMap.opt.readonly) return

    if (this._justFinishedDrag) {
      this._justFinishedDrag = false
      e.stopPropagation()
      return
    }

    const isNodeActive = node.getData('isActive')
    DBG('onNodeImgClick | isNodeActive:', isNodeActive,
        '| isImgSelected:', this.isImgSelected,
        '| sameNode:', this.selectedNode === node)

    if (this.isImgSelected && this.selectedNode === node) {
      e.stopPropagation()
      DBG('onNodeImgClick | already selected, preview')
      this.previewSelectedImg(e, 'selected-image-click')
      return
    }

    if (isNodeActive) {
      e.stopPropagation()
      this.selectImg(node, imgNode)
    } else {
      DBG('onNodeImgClick | ignored: node is not active')
    }
  }

  onNodeImgContextmenu(node, imgNode, e) {
    if (this.mindMap.opt.readonly) return
    e.preventDefault()
    e.stopPropagation()
    this.suppressDeselect('image-contextmenu', 300)
    DBG('onNodeImgContextmenu | selecting image for context menu')
    if (!this.isImgSelected || this.selectedNode !== node) {
      this.selectImg(node, imgNode)
    } else {
      this.updateHighlightPos()
    }
  }

  onNodeImgMousedown(node, imgNode, e) {
    if (this.mindMap.opt.readonly) return
    DBG('onNodeImgMousedown | button:', e.button,
        '| selected:', this.isImgSelected,
        '| sameNode:', this.selectedNode === node)
    if (e.button !== 0) return
    this._stopMouseEvent(e, 'onNodeImgMousedown')
    this._resetCoreMouseState('onNodeImgMousedown')
    if (!this.isImgSelected || this.selectedNode !== node) {
      DBG('onNodeImgMousedown | left image down ignored for placement: image not selected')
      return
    }
    if (this._isResizing) return

    this._dragPending = true
    this.dragStartX = e.clientX
    this.dragStartY = e.clientY
    DBG('onNodeImgMousedown | drag pending start:', this.dragStartX, this.dragStartY)
  }

  onMousemove(e) {
    if (this._isResizing) return
    if (!this._dragPending && !this.isDraggingPlacement) return
    if (!this.selectedNode) return
    this._resetCoreMouseState('placement-move')

    const dx = e.clientX - this.dragStartX
    const dy = e.clientY - this.dragStartY

    if (this._dragPending && !this.isDraggingPlacement) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return
      this._dragPending = false
      this.isDraggingPlacement = true
      DBG('onMousemove | placement drag start | dx:', dx, '| dy:', dy)
    }

    this.showPlacementOverlay(e.clientX, e.clientY)
  }

  handleMouseup(e) {
    if (this._isResizing) return
    if (this._dragPending && !this.isDraggingPlacement) {
      DBG('handleMouseup | cancel pending image drag before threshold')
      this._dragPending = false
      return
    }
    if (!this.isDraggingPlacement) return
    this._resetCoreMouseState('placement-mouseup')

    const dx = e.clientX - this.dragStartX
    const dy = e.clientY - this.dragStartY

    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      this.applyPlacementFromDrag(e.clientX, e.clientY)
    } else {
      DBG('handleMouseup | placement unchanged: movement below threshold')
    }

    this.isDraggingPlacement = false
    this._dragPending = false
    this.dragTargetNode = null
    this._justFinishedDrag = true
    this.hidePlacementOverlay()
    DBG('handleMouseup | placement drag finished | dx:', dx, '| dy:', dy)
  }

  // ====== 选中/取消选中 ======

  suppressDeselect(reason, ms = 250) {
    const until = Date.now() + ms
    if (until > this._suppressDeselectUntil) {
      this._suppressDeselectUntil = until
      this._suppressDeselectReason = reason
    }
  }

  shouldSuppressDeselect(caller) {
    if (Date.now() >= this._suppressDeselectUntil) return false
    DBG(
      caller + ' | deselect suppressed:',
      this._suppressDeselectReason
    )
    return true
  }

  isLeftMouseEvent(e) {
    if (!e) return true
    if (e.button === 0 || e.which === 1) return true
    return e.button == null && e.which == null
  }

  isRightMouseEvent(e) {
    if (!e) return false
    return e.button === 2 || e.which === 3
  }

  isEventOnSelectedImage(e) {
    if (!e || !this.selectedImgNode) return false
    const target = e.target
    const imgDom = this.selectedImgNode.node || this.selectedImgNode
    if (!target || !imgDom) return false
    return target === imgDom || (imgDom.contains && imgDom.contains(target))
  }

  isEventInImgSelectUi(e) {
    if (!e || !e.target) return false
    const target = e.target
    return (
      (this.highlightEl && this.highlightEl.contains(target)) ||
      (this.dragPlacementOverlay && this.dragPlacementOverlay.contains(target)) ||
      (target.closest && (
        target.closest('.contextmenuContainer') ||
        target.closest('.viewer-container') ||
        target.closest('.viewer-backdrop') ||
        target.closest('.viewer-canvas')
      ))
    )
  }

  onDocumentMousedownCapture(e) {
    if (!this.isImgSelected || this._isResizing) return
    if (!this.isLeftMouseEvent(e) || this.isRightMouseEvent(e)) return
    if (this._justFinishedDrag) {
      DBG('onDocumentMousedownCapture | clear stale just-finished-drag on new mousedown')
      this._justFinishedDrag = false
    }
    if (this.isEventOnSelectedImage(e) || this.isEventInImgSelectUi(e)) return
    DBG('onDocumentMousedownCapture | deselect image | target:',
        e.target && e.target.tagName,
        '| nodeUid:', this.selectedNode && this.selectedNode.uid,
        '| suppressReason:', this._suppressDeselectReason || 'none')
    this.deselectImg(true, 'document-mousedown-outside')
  }

  selectImg(node, imgNode) {
    if (this.isImgSelected && this.selectedNode === node) {
      DBG('selectImg | already selected, update highlight | nodeUid:', node && node.uid)
      this.updateHighlightPos()
      return
    }
    this.deselectImg()
    this.selectedNode = node
    this.selectedImgNode = imgNode
    this.isImgSelected = true
    if (this.mindMap.renderer && this.mindMap.renderer.activeNodeList.length > 0) {
      DBG('selectImg | clear active node list for exclusive image selection | activeCount:',
          this.mindMap.renderer.activeNodeList.length)
      this.mindMap.execCommand('CLEAR_ACTIVE_NODE')
    }
    this.showHighlight()
    this.mindMap.emit('node_img_selected', node, imgNode)
    let imgRect = null
    try {
      imgRect = imgNode && imgNode.rbox ? imgNode.rbox() : null
    } catch (err) {
      DBG('selectImg | img rbox failed:', err)
    }
    DBG('selectImg | nodeUid:', node && node.uid,
        '| image length:', this.getSelectedImageUrl().length,
        '| imgRect:', imgRect ? JSON.stringify(imgRect) : 'none')
  }

  hideSelectionForPreview() {
    DBG('hideSelectionForPreview | before | isImgSelected:', this.isImgSelected,
        '| nodeUid:', this.selectedNode && this.selectedNode.uid,
        '| hasHighlight:', !!this.highlightEl,
        '| hasPlacementOverlay:', !!this.dragPlacementOverlay)
    clearTimeout(this._previewTimer)
    this._previewTimer = null
    this.hidePlacementOverlay()
  }

  previewSelectedImg(e, source = 'unknown') {
    if (!this.selectedNode) return
    const node = this.selectedNode
    const imgNode = this.selectedImgNode
    this._dragPending = false
    this.isDraggingPlacement = false
    this.hideSelectionForPreview()
    DBG('previewSelectedImg | source:', source,
        '| nodeUid:', node && node.uid,
        '| hasEvent:', !!e,
        '| hasImgNode:', !!imgNode,
        '| keepSelected:', this.isImgSelected && this.selectedNode === node,
        '| image length:', typeof node.getImageUrl === 'function' ? (node.getImageUrl() || '').length : 0)
    this.mindMap.emit('node_img_preview', node, e, imgNode)
  }

  deselectImg(force = false, source = 'unknown') {
    if (!this.isImgSelected) return
    if (!force && this.shouldSuppressDeselect('deselectImg')) return
    if (this._isResizing) {
      DBG('deselectImg | blocked: currently resizing')
      return
    }
    clearTimeout(this._previewTimer)
    this._previewTimer = null
    this.isImgSelected = false
    this.selectedNode = null
    this.selectedImgNode = null
    this.hideHighlight()
    this.hidePlacementOverlay()
    this.isDraggingPlacement = false
    this._dragPending = false
    this.dragTargetNode = null
    this.mindMap.emit('node_img_deselected')
    DBG('deselectImg | done | source:', source, '| force:', force)
  }

  onDrawClick() {
    if (this._justFinishedDrag) {
      this._justFinishedDrag = false
      return
    }
    if (this._isResizing) return
    if (this.shouldSuppressDeselect('onDrawClick')) return
    DBG('onDrawClick | deselect image')
    this.deselectImg()
  }

  onSvgMousedown(e) {
    if (this._justFinishedDrag) return
    if (this._isResizing) return
    // 右键不取消选中（右键菜单需要图片保持选中状态）
    if (this.isRightMouseEvent(e)) return
    if (this.shouldSuppressDeselect('onSvgMousedown')) return
    DBG('onSvgMousedown | deselect image')
    this.deselectImg()
  }

  onNodeClick(node, e) {
    if (this._justFinishedDrag) {
      this._justFinishedDrag = false
      return
    }
    if (this._isResizing) return
    // 仅左键点击节点时才取消图片选中
    if (!this.isLeftMouseEvent(e)) return
    if (this.shouldSuppressDeselect('onNodeClick')) return
    if (this.isImgSelected) {
      DBG('onNodeClick | deselect image | clickedNodeUid:', node && node.uid,
          '| selectedNodeUid:', this.selectedNode && this.selectedNode.uid)
      this.deselectImg()
    }
  }

  onNodeDblclick() {
    clearTimeout(this._previewTimer)
    this._previewTimer = null
    if (this.isImgSelected) return
  }

  onNodeActive(node, activeNodes) {
    if (this._isResizing) return
    if (this.shouldSuppressDeselect('onNodeActive')) return
    if (!this.isImgSelected || !this.selectedNode) return

    const list = Array.isArray(activeNodes) ? activeNodes : []
    const isStillActive = list.some(n => n === this.selectedNode)
    if (node === this.selectedNode || isStillActive) return

    // 渲染、保存、图片缩放命令会短暂派发空 active 列表；这不是用户明确取消图片选中。
    if (!node && list.length === 0) {
      DBG('onNodeActive | ignore transient empty active list')
      return
    }

    DBG('onNodeActive | deselect: another node active')
    this.deselectImg()
  }

  onScale() {
    if (this.isImgSelected && !this._isResizing) {
      this.updateHighlightPos()
    }
  }

  onTranslate() {
    if (this.isImgSelected && !this._isResizing) {
      this.updateHighlightPos()
    }
  }

  onRenderEnd() {
    if (this.isImgSelected && this.selectedNode) {
      if (this.selectedNode._imgData && this.selectedNode._imgData.node) {
        this.selectedImgNode = this.selectedNode._imgData.node
      }
      this.updateHighlightPos()
    }
  }

  // ====== 键盘 ======

  onKeydown(e) {
    if (!this.isImgSelected || !this.selectedNode) return

    const isCtrl = e.ctrlKey || e.metaKey

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      e.stopPropagation()
      this.deleteSelectedImg()
      return
    }
    if (isCtrl && e.key === 'c') {
      e.preventDefault()
      e.stopPropagation()
      this.copySelectedImg()
      return
    }
    if (isCtrl && e.key === 'x') {
      e.preventDefault()
      e.stopPropagation()
      this.cutSelectedImg()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      this.deselectImg()
    }
  }

  async deleteSelectedImg() {
    if (!this.selectedNode) return
    const node = this.selectedNode
    this.deselectImg()
    this.mindMap.execCommand('SET_NODE_IMAGE', node, { url: null })
  }

  async copySelectedImg() {
    if (!this.selectedNode) return
    const imgUrl = this.selectedNode.getImageUrl()
    if (!imgUrl) return
    try {
      if (navigator.clipboard && navigator.clipboard.write) {
        const response = await fetch(imgUrl)
        const blob = await response.blob()
        const item = new ClipboardItem({ [blob.type]: blob })
        await navigator.clipboard.write([item])
      }
    } catch (err) {
      this._clipboardImgData = {
        url: imgUrl,
        imageSize: this.selectedNode.getData('imageSize'),
        imageTitle: this.selectedNode.getData('imageTitle') || ''
      }
    }
    this.mindMap.emit('node_img_copied', this.selectedNode)
  }

  async cutSelectedImg() {
    if (!this.selectedNode) return
    const node = this.selectedNode
    await this.copySelectedImg()
    this.deselectImg()
    this.mindMap.execCommand('SET_NODE_IMAGE', node, { url: null })
    this.mindMap.emit('node_img_cut', node)
  }

  // ====== 高亮选中边框 + 缩放手柄 ======

  showHighlight() {
    if (!this.selectedImgNode) return
    if (!this.highlightEl) {
      this.highlightEl = document.createElement('div')
      this.highlightEl.className = 'node-img-select-highlight'
      this.highlightEl.style.cssText = `
        position: fixed;
        pointer-events: none;
        box-sizing: border-box;
        border: 2px solid rgba(64, 158, 255, 0.55);
        border-radius: 3px;
        box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.08);
        z-index: ${Z_INDEX.highlight};
        display: none;
      `

      const hitSize = 28
      const dotSize = 12
      this.resizeDotEl = document.createElement('div')
      this.resizeDotEl.className = 'node-img-resize-dot'
      this.resizeDotEl.style.cssText = `
        position: absolute;
        right: ${-(hitSize / 2)}px;
        bottom: ${-(hitSize / 2)}px;
        width: ${hitSize}px;
        height: ${hitSize}px;
        pointer-events: auto;
        cursor: nwse-resize;
        display: flex;
        justify-content: center;
        align-items: center;
      `
      const dotInner = document.createElement('div')
      dotInner.style.cssText = `
        width: ${dotSize}px;
        height: ${dotSize}px;
        background: #fff;
        border: 2px solid rgba(64, 158, 255, 0.65);
        border-radius: 2px;
        box-shadow: 0 0 4px rgba(0,0,0,0.35);
        pointer-events: none;
      `
      this.resizeDotEl.appendChild(dotInner)

      this.resizeDotEl.addEventListener('mousedown', (e) => {
        e.stopPropagation()
        e.preventDefault()
        DBG('resizeDot mousedown | clientX:', e.clientX, '| clientY:', e.clientY)
        this._startResize(e)
      })

      this.highlightEl.appendChild(this.resizeDotEl)
      const targetNode = this.mindMap.opt.customInnerElsAppendTo || document.body
      targetNode.appendChild(this.highlightEl)
    }
    this.updateHighlightPos()
    this.highlightEl.style.display = 'block'
  }

  hideHighlight() {
    if (this.highlightEl) {
      this.highlightEl.style.display = 'none'
    }
  }

  updateHighlightPos() {
    if (!this.highlightEl || !this.selectedImgNode) return
    try {
      const rect = this.selectedImgNode.rbox()
      this.highlightEl.style.left = rect.x + 'px'
      this.highlightEl.style.top = rect.y + 'px'
      this.highlightEl.style.width = rect.width + 'px'
      this.highlightEl.style.height = rect.height + 'px'
    } catch (e) {
      this.hideHighlight()
    }
  }

  // ====== 拖拽调整位置覆盖层 ======

  showPlacementOverlay(mouseX, mouseY) {
    if (!this.selectedNode) return
    const targetNode = this.getPlacementTargetNode(mouseX, mouseY)
    if (!targetNode) {
      this.dragTargetNode = null
      this.hidePlacementOverlay()
      return
    }
    this.dragTargetNode = targetNode
    const nodeEl = targetNode.hoverNode || targetNode.group
    if (!nodeEl) return

    if (!this.dragPlacementOverlay) {
      this.dragPlacementOverlay = document.createElement('div')
      this.dragPlacementOverlay.className = 'node-img-placement-overlay'
      this.dragPlacementOverlay.style.cssText = `
        position: fixed;
        z-index: ${Z_INDEX.placementOverlay};
        pointer-events: none;
        display: none;
        border-radius: 6px;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.55);
      `
      const cellStyle = `
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        color: rgba(0,0,0,0.4);
        transition: background-color 0.15s;
        position: absolute;
      `
      this.dragPlacementOverlay.innerHTML = `
        <div data-placement="top" style="${cellStyle} left:0; top:0; width:100%; height:40%; border-radius:6px 6px 0 0;"></div>
        <div data-placement="bottom" style="${cellStyle} left:0; bottom:0; width:100%; height:40%; border-radius:0 0 6px 6px;"></div>
        <div data-placement="left" style="${cellStyle} left:0; top:40%; width:50%; height:20%;"></div>
        <div data-placement="right" style="${cellStyle} right:0; top:40%; width:50%; height:20%;"></div>
      `
      const targetNode = this.mindMap.opt.customInnerElsAppendTo || document.body
      targetNode.appendChild(this.dragPlacementOverlay)
    }

    const rbox = nodeEl.rbox()
    this.dragPlacementOverlay.style.left = rbox.x + 'px'
    this.dragPlacementOverlay.style.top = rbox.y + 'px'
    this.dragPlacementOverlay.style.width = rbox.width + 'px'
    this.dragPlacementOverlay.style.height = rbox.height + 'px'
    this.dragPlacementOverlay.style.display = 'block'

    const placement = this.calcPlacementFromMouse(mouseX, mouseY, rbox)
    const cells = this.dragPlacementOverlay.querySelectorAll('[data-placement]')
    cells.forEach(cell => {
      if (cell.dataset.placement === placement) {
        cell.style.backgroundColor = 'rgba(64, 158, 255, 0.3)'
        cell.style.border = '2px dashed rgba(64, 158, 255, 0.6)'
      } else {
        cell.style.backgroundColor = 'rgba(0, 0, 0, 0.03)'
        cell.style.border = '1px solid rgba(0, 0, 0, 0.08)'
      }
    })
  }

  hidePlacementOverlay() {
    if (this.dragPlacementOverlay) {
      this.dragPlacementOverlay.style.display = 'none'
    }
  }

  getPlacementTargetNode(mouseX, mouseY) {
    const hoverNode = this.getNodeAtPoint(mouseX, mouseY)
    if (!hoverNode || hoverNode === this.selectedNode) {
      return this.selectedNode
    }
    if (!this.nodeHasImage(hoverNode)) {
      return hoverNode
    }
    DBG('getPlacementTargetNode | skip node with image | nodeUid:', hoverNode.uid)
    return null
  }

  getNodeAtPoint(mouseX, mouseY) {
    const cache = (this.mindMap.renderer && this.mindMap.renderer.nodeCache) || {}
    const nodeList = Object.keys(cache).map(uid => cache[uid]).filter(Boolean)
    for (let i = nodeList.length - 1; i >= 0; i--) {
      const node = nodeList[i]
      if (!node || !node.group) continue
      try {
        const rect = node.getRect ? node.getRect() : node.group.rbox()
        if (
          rect &&
          mouseX >= rect.x &&
          mouseX <= rect.x + rect.width &&
          mouseY >= rect.y &&
          mouseY <= rect.y + rect.height
        ) {
          return node
        }
      } catch (err) {
        DBG('getNodeAtPoint | rbox failed | nodeUid:', node && node.uid, err)
      }
    }
    return null
  }

  nodeHasImage(node) {
    return !!(node && node.getData && node.getData('image'))
  }

  getNodeImagePayload(node) {
    if (!node || !node.getData) return null
    const image = node.getData('image')
    if (!image) return null
    const imageSize = node.getData('imageSize') || {}
    return {
      url: image,
      title: node.getData('imageTitle') || '',
      width: imageSize.width,
      height: imageSize.height,
      custom: imageSize.custom === true
    }
  }

  calcPlacementFromMouse(mouseX, mouseY, rbox) {
    const dx = mouseX - (rbox.x + rbox.width / 2)
    const relY = (mouseY - rbox.y) / rbox.height
    if (relY < 0.4) return 'top'
    if (relY > 0.6) return 'bottom'
    return dx < 0 ? 'left' : 'right'
  }

  applyPlacementFromDrag(mouseX, mouseY) {
    if (!this.selectedNode) return
    const targetNode = this.dragTargetNode || this.getPlacementTargetNode(mouseX, mouseY)
    if (!targetNode) {
      DBG('applyPlacementFromDrag | no valid target')
      return
    }
    const nodeEl = targetNode.hoverNode || targetNode.group
    if (!nodeEl) return
    const rbox = nodeEl.rbox()
    const placement = this.calcPlacementFromMouse(mouseX, mouseY, rbox)
    const currentPlacement = targetNode.getStyle('imgPlacement') || 'top'
    DBG('applyPlacementFromDrag | placement:', placement,
        '| current:', currentPlacement,
        '| mouse:', mouseX, mouseY,
        '| nodeRbox:', JSON.stringify(rbox),
        '| sourceUid:', this.selectedNode && this.selectedNode.uid,
        '| targetUid:', targetNode && targetNode.uid)
    if (targetNode !== this.selectedNode) {
      this.transferImageToNode(targetNode, placement)
      return
    }
    if (placement !== currentPlacement) {
      this.selectedNode.setStyle('imgPlacement', placement)
      DBG('applyPlacementFromDrag | applied placement:', placement)
    } else {
      DBG('applyPlacementFromDrag | unchanged')
    }
  }

  transferImageToNode(targetNode, placement) {
    if (!this.selectedNode || !targetNode || targetNode === this.selectedNode) return
    if (this.nodeHasImage(targetNode)) {
      DBG('transferImageToNode | abort: target already has image | targetUid:', targetNode.uid)
      return
    }
    const sourceNode = this.selectedNode
    const payload = this.getNodeImagePayload(sourceNode)
    if (!payload) {
      DBG('transferImageToNode | abort: no source image | sourceUid:', sourceNode.uid)
      return
    }
    targetNode.setStyle('imgPlacement', placement)
    this.mindMap.execCommand('SET_NODE_IMAGE', targetNode, payload)
    this.mindMap.execCommand('SET_NODE_IMAGE', sourceNode, {
      url: null,
      title: '',
      width: 0,
      height: 0,
      custom: false
    })
    this.selectedNode = targetNode
    this.selectedImgNode = null
    DBG('transferImageToNode | moved image | sourceUid:', sourceNode.uid,
        '| targetUid:', targetNode.uid,
        '| placement:', placement)
    this.mindMap.render(() => {
      if (
        this.selectedNode === targetNode &&
        targetNode._imgData &&
        targetNode._imgData.node
      ) {
        this.selectedImgNode = targetNode._imgData.node
        this.showHighlight()
      }
    })
  }

  // ====== 清理 ======

  beforePluginRemove() {
    this.deselectImg()
    this.unBindEvent()
    this._cancelResizeRenderFrame()
    if (this.highlightEl && this.highlightEl.parentNode) {
      this.highlightEl.parentNode.removeChild(this.highlightEl)
    }
    if (this.dragPlacementOverlay && this.dragPlacementOverlay.parentNode) {
      this.dragPlacementOverlay.parentNode.removeChild(this.dragPlacementOverlay)
    }
  }

  beforePluginDestroy() {
    this.beforePluginRemove()
  }
}

NodeImgSelect.instanceName = 'nodeImgSelect'

export default NodeImgSelect
