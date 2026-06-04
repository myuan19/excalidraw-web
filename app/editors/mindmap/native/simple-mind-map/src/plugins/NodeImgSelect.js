// 图片选中管理插件
// 实现：单击选中节点后再点击图片 → 选中图片，选中图片后可以用快捷键/右键操作
class NodeImgSelect {
  constructor({ mindMap }) {
    this.mindMap = mindMap
    this.selectedNode = null
    this.selectedImgNode = null
    this.isImgSelected = false
    this.highlightEl = null

    // 拖拽调整位置 —— 使用 "pending drag" 模式：
    // mousedown 只记录起点，mousemove 超过阈值后才真正进入拖拽
    this.isDraggingPlacement = false
    this._dragPending = false
    this._justFinishedDrag = false
    this.dragStartX = 0
    this.dragStartY = 0
    this.dragPlacementOverlay = null

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

    // mouseup / node_mouseup 参数签名不同，用各自的 wrapper 统一提取 DOM Event
    this._onCanvasMouseup = (e) => { this.handleMouseup(e) }
    this._onNodeMouseup = (_node, e) => { this.handleMouseup(e) }

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
  }

  onNodeImgClick(node, imgNode, e) {
    if (this.mindMap.opt.readonly) return

    if (this._justFinishedDrag) {
      this._justFinishedDrag = false
      e.stopPropagation()
      return
    }

    const isNodeActive = node.getData('isActive')

    if (this.isImgSelected && this.selectedNode === node) {
      e.stopPropagation()
      this.mindMap.emit('node_img_preview', node, e)
      return
    }

    if (isNodeActive) {
      e.stopPropagation()
      this.selectImg(node, imgNode)
    }
  }

  onNodeImgContextmenu(node, imgNode, e) {
    if (this.mindMap.opt.readonly) return
    e.preventDefault()
    e.stopPropagation()
    this.selectImg(node, imgNode)
  }

  onNodeImgMousedown(node, imgNode, e) {
    if (this.mindMap.opt.readonly) return
    if (e.button !== 0) return
    if (!this.isImgSelected || this.selectedNode !== node) return

    this._dragPending = true
    this.dragStartX = e.clientX
    this.dragStartY = e.clientY
    e.stopPropagation()
  }

  onMousemove(e) {
    if (!this._dragPending && !this.isDraggingPlacement) return
    if (!this.selectedNode) return

    const dx = e.clientX - this.dragStartX
    const dy = e.clientY - this.dragStartY

    if (this._dragPending && !this.isDraggingPlacement) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return
      this._dragPending = false
      this.isDraggingPlacement = true
    }

    this.showPlacementOverlay(e.clientX, e.clientY)
  }

  handleMouseup(e) {
    if (this._dragPending && !this.isDraggingPlacement) {
      this._dragPending = false
      return
    }
    if (!this.isDraggingPlacement) return

    const dx = e.clientX - this.dragStartX
    const dy = e.clientY - this.dragStartY

    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      this.applyPlacementFromDrag(e.clientX, e.clientY)
    }

    this.isDraggingPlacement = false
    this._dragPending = false
    this._justFinishedDrag = true
    this.hidePlacementOverlay()
  }

  selectImg(node, imgNode) {
    this.deselectImg()
    this.selectedNode = node
    this.selectedImgNode = imgNode
    this.isImgSelected = true
    this.showHighlight()
    this.mindMap.emit('node_img_selected', node, imgNode)
  }

  deselectImg() {
    if (!this.isImgSelected) return
    this.isImgSelected = false
    this.selectedNode = null
    this.selectedImgNode = null
    this.hideHighlight()
    this.hidePlacementOverlay()
    this.isDraggingPlacement = false
    this._dragPending = false
    this.mindMap.emit('node_img_deselected')
  }

  onDrawClick() {
    if (this._justFinishedDrag) {
      this._justFinishedDrag = false
      return
    }
    this.deselectImg()
  }

  onSvgMousedown() {
    if (this._justFinishedDrag) return
    this.deselectImg()
  }

  onNodeClick(node) {
    if (this._justFinishedDrag) {
      this._justFinishedDrag = false
      return
    }
    if (this.isImgSelected) {
      this.deselectImg()
    }
  }

  onNodeDblclick() {
    this.deselectImg()
  }

  onNodeActive(node, activeNodes) {
    if (this.isImgSelected && this.selectedNode) {
      const isStillActive = activeNodes.some(n => n === this.selectedNode)
      if (!isStillActive) {
        this.deselectImg()
      }
    }
  }

  onScale() {
    if (this.isImgSelected) {
      this.updateHighlightPos()
    }
  }

  onTranslate() {
    if (this.isImgSelected) {
      this.updateHighlightPos()
    }
  }

  onRenderEnd() {
    if (this.isImgSelected && this.selectedNode) {
      // 重新渲染后 SVG image 节点会被重建，刷新引用
      if (this.selectedNode._imgData && this.selectedNode._imgData.node) {
        this.selectedImgNode = this.selectedNode._imgData.node
      }
      this.updateHighlightPos()
    }
  }

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

  // 高亮选中图片
  showHighlight() {
    if (!this.selectedImgNode) return
    if (!this.highlightEl) {
      this.highlightEl = document.createElement('div')
      this.highlightEl.className = 'node-img-select-highlight'
      this.highlightEl.style.cssText = `
        position: fixed;
        pointer-events: none;
        box-sizing: border-box;
        border: 2px solid #409EFF;
        border-radius: 5px;
        box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.15);
        z-index: 1999;
        display: none;
      `
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
    if (!this.highlightEl || !this.selectedNode) return
    try {
      // 对齐到节点 group 的边界（即单元格边界）
      const rect = this.selectedNode.group.rbox()
      this.highlightEl.style.left = `${rect.x}px`
      this.highlightEl.style.top = `${rect.y}px`
      this.highlightEl.style.width = `${rect.width}px`
      this.highlightEl.style.height = `${rect.height}px`
    } catch (e) {
      this.hideHighlight()
    }
  }

  // 拖拽调整位置：四象限覆盖层
  showPlacementOverlay(mouseX, mouseY) {
    if (!this.selectedNode) return
    const nodeEl = this.selectedNode.group
    if (!nodeEl) return

    if (!this.dragPlacementOverlay) {
      this.dragPlacementOverlay = document.createElement('div')
      this.dragPlacementOverlay.className = 'node-img-placement-overlay'
      this.dragPlacementOverlay.style.cssText = `
        position: fixed;
        z-index: 2000;
        pointer-events: none;
        display: none;
        border-radius: 6px;
        overflow: hidden;
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
    this.dragPlacementOverlay.style.left = `${rbox.x}px`
    this.dragPlacementOverlay.style.top = `${rbox.y}px`
    this.dragPlacementOverlay.style.width = `${rbox.width}px`
    this.dragPlacementOverlay.style.height = `${rbox.height}px`
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

  calcPlacementFromMouse(mouseX, mouseY, rbox) {
    const cx = rbox.x + rbox.width / 2
    const cy = rbox.y + rbox.height / 2
    const dx = mouseX - cx
    const dy = mouseY - cy
    const relY = (mouseY - rbox.y) / rbox.height

    // 上半部分 → top
    if (relY < 0.4) return 'top'
    // 下半部分 → bottom
    if (relY > 0.6) return 'bottom'
    // 中间区域按左右分
    return dx < 0 ? 'left' : 'right'
  }

  applyPlacementFromDrag(mouseX, mouseY) {
    if (!this.selectedNode) return
    const nodeEl = this.selectedNode.group
    if (!nodeEl) return

    const rbox = nodeEl.rbox()
    const placement = this.calcPlacementFromMouse(mouseX, mouseY, rbox)
    const currentPlacement = this.selectedNode.getStyle('imgPlacement') || 'top'

    if (placement !== currentPlacement) {
      this.selectedNode.setStyle('imgPlacement', placement)
    }
  }

  beforePluginRemove() {
    this.deselectImg()
    this.unBindEvent()
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
