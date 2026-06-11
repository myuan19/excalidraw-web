import {
  bfsWalk,
  throttle,
  getTopAncestorsFomNodeList,
  getNodeIndexInNodeList,
  getNodeDataIndex,
  sortNodeList
} from '../utils'
import Base from '../layouts/Base'
import { CONSTANTS } from '../constants/constant'
import AutoMove from '../utils/AutoMove'
import {
  createDragSubtreeClone,
  disposeDragCloneLayer
} from '../core/render/drag/dragSubtreeClone'

// 节点拖动插件
class Drag extends Base {
  //  构造函数
  constructor({ mindMap }) {
    super(mindMap.renderer)
    this.mindMap = mindMap
    this.autoMove = new AutoMove(mindMap)
    this.reset()
    this.bindEvent()
  }

  //  复位
  reset() {
    // 是否正在拖拽中
    this.isDragging = false
    // 鼠标按下的节点
    this.mousedownNode = null
    // 被拖拽中的节点列表
    this.beingDragNodeList = []
    // 当前画布节点列表
    this.nodeList = []
    // Xmind-style 拖拽会话：拖拽中只更新 possibleDrop，松手时统一提交
    this.dragSession = null
    this.dropTargets = []
    this.possibleDrop = null
    this.snapOffset = null
    this.snapTargets = []
    this.snapTargetAnchors = []
    this.snapGuideLines = []
    this.lastDragClientX = 0
    this.lastDragClientY = 0
    this.lastDragCtrlKey = false
    this.lastDropTargetKey = ''
    this.dragMoveFrame = null
    this.pendingDragMove = null
    this.isDragStartPending = false
    // 当前重叠节点
    this.overlapNode = null
    // 当前上一个同级节点
    this.prevNode = null
    // 当前下一个同级节点
    this.nextNode = null
    // 画布的变换数据
    this.drawTransform = null
    // 克隆节点
    this.clone = null
    // 同级位置占位符
    this.placeholder = null
    this.placeholderWidth = 50
    this.placeholderHeight = 10
    this.dropIndicatorHeight = 18
    this.placeHolderLine = null
    this.placeHolderExtraLines = []
    // 鼠标按下位置和节点左上角的偏移量
    this.offsetX = 0
    this.offsetY = 0
    // 当前鼠标是否按下
    this.isMousedown = false
    // 拖拽的鼠标位置变量
    this.mouseDownX = 0
    this.mouseDownY = 0
    this.mouseMoveX = 0
    this.mouseMoveY = 0
    // 鼠标移动的距离距鼠标按下的位置距离多少以上才认为是拖动事件
    this.checkDragOffset = 8
    this.minOffset = 10
  }

  //  绑定事件
  bindEvent() {
    this.onNodeMousedown = this.onNodeMousedown.bind(this)
    this.onMousemove = this.onMousemove.bind(this)
    this.onMouseup = this.onMouseup.bind(this)
    this.onDocumentKeydown = this.onDocumentKeydown.bind(this)
    this.checkOverlapNode = throttle(this.checkOverlapNode, 300, this)

    this.mindMap.on('node_mousedown', this.onNodeMousedown)
    this.mindMap.on('mousemove', this.onMousemove)
    this.mindMap.on('node_mouseup', this.onMouseup)
    this.mindMap.on('mouseup', this.onMouseup)
  }

  // 解绑事件
  unBindEvent() {
    this.mindMap.off('node_mousedown', this.onNodeMousedown)
    this.mindMap.off('mousemove', this.onMousemove)
    this.mindMap.off('node_mouseup', this.onMouseup)
    this.mindMap.off('mouseup', this.onMouseup)
    this.unbindDocumentDragEvents()
  }

  // 节点鼠标按下事件
  onNodeMousedown(node, e) {
    // 只读模式、不是鼠标左键按下、按下的是概要节点或根节点直接返回
    if (
      this.mindMap.opt.readonly ||
      e.which !== 1 ||
      node.isGeneralization ||
      node.isRoot
    ) {
      return
    }
    this.isMousedown = true
    // 记录鼠标按下时的节点
    this.mousedownNode = node
    // 记录鼠标按下的坐标
    const { x, y } = this.mindMap.toPos(e.clientX, e.clientY)
    this.mouseDownX = x
    this.mouseDownY = y
    this.bindDocumentDragEvents()
  }

  bindDocumentDragEvents() {
    document.addEventListener('mouseup', this.onMouseup, true)
    document.addEventListener('keydown', this.onDocumentKeydown, true)
  }

  unbindDocumentDragEvents() {
    document.removeEventListener('mouseup', this.onMouseup, true)
    document.removeEventListener('keydown', this.onDocumentKeydown, true)
  }

  onDocumentKeydown(e) {
    if (e.key !== 'Escape' || !this.isMousedown) {
      return
    }
    this.cancelDrag()
  }

  cancelDrag() {
    if (this.autoMove) {
      this.autoMove.clearAutoMoveTimer()
    }
    this.beingDragNodeList.forEach(node => {
      node.setOpacity(1)
      node.showChildren()
      node.endDrag()
    })
    this.removeCloneNode()
    this.cancelDragMoveFrame()
    this.unbindDocumentDragEvents()
    this.reset()
  }

  cancelDragMoveFrame() {
    if (!this.dragMoveFrame) {
      this.pendingDragMove = null
      return
    }
    const cancel =
      typeof window !== 'undefined' && window.cancelAnimationFrame
        ? window.cancelAnimationFrame.bind(window)
        : clearTimeout
    cancel(this.dragMoveFrame)
    this.dragMoveFrame = null
    this.pendingDragMove = null
  }

  // 鼠标移动事件
  async onMousemove(e) {
    if (this.mindMap.opt.readonly || !this.isMousedown) {
      return
    }
    e.preventDefault()
    const { x, y } = this.mindMap.toPos(e.clientX, e.clientY)
    this.mouseMoveX = x
    this.mouseMoveY = y
    // 还没开始移动时鼠标位移过小不认为是拖拽
    if (
      !this.isDragging &&
      Math.abs(x - this.mouseDownX) <= this.checkDragOffset &&
      Math.abs(y - this.mouseDownY) <= this.checkDragOffset
    ) {
      return
    }
    this.mindMap.emit('node_dragging', this.mousedownNode)
    await this.handleStartMove()
    this.scheduleDragMove(x, y, e)
  }

  scheduleDragMove(x, y, e) {
    this.pendingDragMove = {
      x,
      y,
      clientX: e.clientX,
      clientY: e.clientY,
      ctrlKey: e.ctrlKey
    }
    if (this.dragMoveFrame) {
      return
    }
    const schedule =
      typeof window !== 'undefined' && window.requestAnimationFrame
        ? window.requestAnimationFrame.bind(window)
        : fn => setTimeout(fn, 16)
    this.dragMoveFrame = schedule(() => {
      this.dragMoveFrame = null
      const pending = this.pendingDragMove
      this.pendingDragMove = null
      if (!pending) {
        return
      }
      this.onMove(pending.x, pending.y, pending)
    })
  }

  //  鼠标松开事件
  async onMouseup(e) {
    if (!this.isMousedown) {
      return
    }
    const { autoMoveWhenMouseInEdgeOnDrag, enableFreeDrag, beforeDragEnd } =
      this.mindMap.opt
    // 停止自动移动
    if (autoMoveWhenMouseInEdgeOnDrag && this.mindMap.select) {
      this.autoMove.clearAutoMoveTimer()
    }
    this.flushDragMoveFrame()
    if (autoMoveWhenMouseInEdgeOnDrag && this.mindMap.select) {
      this.autoMove.clearAutoMoveTimer()
    }
    this.isMousedown = false
    this.unbindDocumentDragEvents()
    const draggedNodes = [...this.beingDragNodeList]
    this.cancelDragMoveFrame()
    // 微距取消：松手时指针仍在按下点附近（含拖出后又拖回），视为未发生
    // 拖拽，清空所有落点状态，只走清理路径，不提交任何移动命令
    const isMicroMove =
      this.isDragging && this.checkIsMicroMove(e.clientX, e.clientY)
    if (isMicroMove) {
      this.possibleDrop = null
      this.overlapNode = null
      this.prevNode = null
      this.nextNode = null
    }
    const dropUids = this.getDropTargetUids(this.possibleDrop)
    let overlapNodeUid = this.overlapNode
      ? this.overlapNode.getData('uid')
      : dropUids.overlapNodeUid
    let prevNodeUid = this.prevNode
      ? this.prevNode.getData('uid')
      : dropUids.prevNodeUid
    let nextNodeUid = this.nextNode
      ? this.nextNode.getData('uid')
      : dropUids.nextNodeUid
    if (this.isDragging && typeof beforeDragEnd === 'function') {
      const isCancel = await beforeDragEnd({
        overlapNodeUid,
        prevNodeUid,
        nextNodeUid,
        beingDragNodeList: [...this.beingDragNodeList],
        possibleDrop: this.possibleDrop
      })
      if (isCancel) {
        this.reset()
        return
      }
    }
    // 新算法统一按 DropTarget 提交；不支持的布局继续走旧逻辑作为 fallback
    if (this.isDropTargetLayout() && this.possibleDrop) {
      this.commitDrop(this.beingDragNodeList, this.possibleDrop)
    } else if (this.overlapNode) {
      // 存在重叠子节点，则移动作为其子节点
      this.removeNodeActive(this.overlapNode)
      this.mindMap.execCommand(
        'MOVE_NODE_TO',
        this.beingDragNodeList,
        this.overlapNode
      )
    } else if (this.prevNode) {
      // 存在前一个相邻节点，作为其下一个兄弟节点
      this.removeNodeActive(this.prevNode)
      this.mindMap.execCommand(
        'INSERT_AFTER',
        this.beingDragNodeList,
        this.prevNode
      )
    } else if (this.nextNode) {
      // 存在下一个相邻节点，作为其前一个兄弟节点
      this.removeNodeActive(this.nextNode)
      this.mindMap.execCommand(
        'INSERT_BEFORE',
        this.beingDragNodeList,
        this.nextNode
      )
    } else if (
      !isMicroMove &&
      this.clone &&
      enableFreeDrag &&
      this.beingDragNodeList.length === 1
    ) {
      // 如果只拖拽了一个节点，那么设置自定义位置
      let { x, y } = this.mindMap.toPos(
        e.clientX - this.offsetX,
        e.clientY - this.offsetY
      )
      let { scaleX, scaleY, translateX, translateY } = this.drawTransform
      x = (x - translateX) / scaleX
      y = (y - translateY) / scaleY
      this.mousedownNode.left = x
      this.mousedownNode.top = y
      this.mousedownNode.customLeft = x
      this.mousedownNode.customTop = y
      this.mindMap.execCommand(
        'SET_NODE_CUSTOM_POSITION',
        this.mousedownNode,
        x,
        y
      )
      this.mindMap.render(null, 'node-free-drag')
    }
    this.removeCloneNode()
    draggedNodes.forEach(node => {
      node.setOpacity(1)
      node.showChildren()
      node.endDrag()
    })
    if (this.isDragging) {
      this.mindMap.emit('node_dragend', {
        overlapNodeUid,
        prevNodeUid,
        nextNodeUid
      })
    }
    this.reset()
  }

  flushDragMoveFrame() {
    if (!this.pendingDragMove) {
      this.cancelDragMoveFrame()
      return
    }
    const pending = this.pendingDragMove
    this.cancelDragMoveFrame()
    this.onMove(pending.x, pending.y, pending)
  }

  // 移除节点的激活状态
  removeNodeActive(node) {
    if (node.getData('isActive')) {
      this.mindMap.execCommand('SET_NODE_ACTIVE', node, false)
    }
  }

  // 微距判定：指针（视口坐标）距按下点的位移是否在取消阈值内
  checkIsMicroMove(clientX, clientY) {
    const { x, y } = this.mindMap.toPos(clientX, clientY)
    return this.checkIsMicroMovePos(x, y)
  }

  // 微距判定：容器坐标版本
  checkIsMicroMovePos(x, y) {
    const dx = x - this.mouseDownX
    const dy = y - this.mouseDownY
    return Math.sqrt(dx * dx + dy * dy) <= this.getMicroMoveThreshold()
  }

  getMicroMoveThreshold() {
    const value = Number(this.mindMap.opt.dragMicroMoveThreshold)
    return Number.isFinite(value) && value >= 0 ? value : 12
  }

  //  拖动中
  onMove(x, y, e) {
    if (!this.isMousedown || !this.isDragging) {
      return
    }
    this.lastDragClientX = e.clientX
    this.lastDragClientY = e.clientY
    this.lastDragCtrlKey = !!e.ctrlKey
    // 更新克隆节点的位置
    this.drawTransform = this.mindMap.draw.transform()
    let { scaleX, scaleY, translateX, translateY } = this.drawTransform
    let cloneNodeLeft = x - this.offsetX
    let cloneNodeTop = y - this.offsetY
    if (this.isDropTargetLayout()) {
      if (this.isSnapEnabled(e)) {
        this.snapTargets = this.computeSnapTargets(x, y)
        this.snapOffset = this.resolveSnapOffset(this.snapTargets)
      } else {
        this.snapTargets = []
        this.snapOffset = {
          x: 0,
          y: 0
        }
      }
      this.dragSession.currentPoint = {
        x: x + this.snapOffset.x,
        y: y + this.snapOffset.y
      }
      this.dragSession.snapTargets = this.snapTargets
      this.dragSession.snapOffset = this.snapOffset
    }
    x = (cloneNodeLeft - translateX) / scaleX
    y = (cloneNodeTop - translateY) / scaleY
    let t = this.clone.transform()
    this.clone.translate(x - t.translateX, y - t.translateY)
    // 检测新位置
    if (this.isDropTargetLayout()) {
      this.updateDropTarget()
    } else {
      this.checkOverlapNode()
    }
    // 边缘自动移动画布
    this.drawTransform = this.mindMap.draw.transform()
    this.autoMove.clearAutoMoveTimer()
    this.autoMove.onMove(
      e.clientX,
      e.clientY,
      () => {},
      () => {
        if (!this.isDropTargetLayout()) {
          return
        }
        setTimeout(() => {
          if (!this.isDragging) {
            return
          }
          this.drawTransform = this.mindMap.draw.transform()
          this.refreshDragGeometry()
          this.updateDragSessionPoint()
          this.updateDropTarget()
        }, 0)
      }
    )
  }

  // 开始拖拽时初始化一些数据
  async handleStartMove() {
    if (!this.isDragging) {
      if (this.isDragStartPending) {
        return
      }
      this.isDragStartPending = true
      // 鼠标按下的节点
      let node = this.mousedownNode
      // 计算鼠标按下的位置距离节点左上角的距离
      this.drawTransform = this.mindMap.draw.transform()
      let { scaleX, scaleY, translateX, translateY } = this.drawTransform
      this.offsetX = this.mouseDownX - (node.left * scaleX + translateX)
      this.offsetY = this.mouseDownY - (node.top * scaleY + translateY)
      // 如果鼠标按下的节点是激活节点，那么保存当前所有激活的节点
      if (node.getData('isActive')) {
        // 找出这些激活节点中的最顶层节点
        // 并按索引从小到大排序
        this.beingDragNodeList = sortNodeList(
          getTopAncestorsFomNodeList(
            // 过滤掉根节点和概要节点
            this.mindMap.renderer.activeNodeList.filter(item => {
              return !item.isRoot && !item.isGeneralization
            })
          )
        )
      } else {
        // 否则只拖拽按下的节点
        this.beingDragNodeList = [node]
      }
      // 拦截拖拽
      const { beforeDragStart } = this.mindMap.opt
      if (typeof beforeDragStart === 'function') {
        const stop = await beforeDragStart([...this.beingDragNodeList])
        if (stop) {
          this.isDragStartPending = false
          return
        }
      }
      if (!this.isMousedown || this.mousedownNode !== node) {
        this.isDragStartPending = false
        return
      }
      // 将节点树转为节点数组
      this.nodeTreeToList()
      // 创建克隆节点
      this.createCloneNode()
      // 初始化新拖拽会话
      this.initDragSession()
      // 清除当前所有激活的节点
      this.mindMap.execCommand('CLEAR_ACTIVE_NODE')
      this.isDragging = true
      this.isDragStartPending = false
    }
  }

  // 节点由树转换成数组，从子节点到根节点
  nodeTreeToList() {
    const list = []
    bfsWalk(this.mindMap.renderer.root, node => {
      // 过滤掉当前被拖拽的节点
      if (this.checkIsInBeingDragNodeList(node)) {
        return
      }
      if (!list[node.layerIndex]) {
        list[node.layerIndex] = []
      }
      list[node.layerIndex].push(node)
    })
    this.nodeList = list.reduceRight((res, cur) => {
      return [...res, ...cur]
    }, [])
  }

  //  创建克隆节点
  createCloneNode() {
    if (!this.clone) {
      const {
        dragMultiNodeRectConfig,
        dragPlaceholderRectFill,
        dragPlaceholderLineConfig,
        dragOpacityConfig,
        handleDragCloneNode
      } = this.mindMap.opt
      const {
        width: rectWidth,
        height: rectHeight,
        fill: rectFill
      } = dragMultiNodeRectConfig
      const node = this.beingDragNodeList[0]
      const lineColor = node.style.merge('lineColor', true)
      // 如果当前被拖拽的节点数量大于1，那么创建一个矩形示意
      if (this.beingDragNodeList.length > 1) {
        this.clone = this.mindMap.otherDraw
          .rect()
          .size(rectWidth, rectHeight)
          .radius(rectHeight / 2)
          .fill({
            color: rectFill || lineColor
          })
        this.offsetX = rectWidth / 2
        this.offsetY = rectHeight / 2
      } else {
        // 否则克隆当前节点的可见子树，拖动时能看到整支内容一起移动
        this.clone = createDragSubtreeClone(this.mindMap.otherDraw, node)
        this.mindMap.otherDraw.add(this.clone)
        if (typeof handleDragCloneNode === 'function') {
          handleDragCloneNode(this.clone)
        }
      }
      this.clone.opacity(dragOpacityConfig.cloneNodeOpacity)
      this.clone.css('z-index', 99999)
      // 同级位置提示元素
      this.placeholder = this.mindMap.otherDraw
        .rect()
        .fill({
          color: dragPlaceholderRectFill || lineColor
        })
        .radius(5)
      this.placeHolderLine = this.mindMap.otherDraw
        .path()
        .stroke({
          color: dragPlaceholderLineConfig.color || lineColor,
          width: dragPlaceholderLineConfig.width
        })
        .fill({ color: 'none' })
      // 当前被拖拽的节点的临时设置
      this.beingDragNodeList.forEach(node => {
        // 降低透明度
        node.setOpacity(dragOpacityConfig.beingDragNodeOpacity)
        // 隐藏连线及下级节点
        node.hideChildren()
        // 设置拖拽状态
        node.startDrag()
      })
    }
  }

  //  移除克隆节点
  removeCloneNode() {
    disposeDragCloneLayer(this.mindMap.otherDraw, this.clone)
    this.clone = null
    if (this.placeholder) {
      this.placeholder.remove()
      this.placeholder = null
    }
    if (this.placeHolderLine) {
      this.placeHolderLine.remove()
      this.placeHolderLine = null
    }
    this.removeExtraLines()
    this.removeSnapGuides()
  }

  // 移除额外创建的连线
  removeExtraLines() {
    this.placeHolderExtraLines.forEach(item => {
      item.remove()
    })
    this.placeHolderExtraLines = []
  }

  removeSnapGuides() {
    this.snapGuideLines.forEach(item => {
      item.remove()
    })
    this.snapGuideLines = []
  }

  // 当前布局是否使用新的 DropTarget 算法
  isDropTargetLayout() {
    const { LOGICAL_STRUCTURE, LOGICAL_STRUCTURE_LEFT, MIND_MAP } =
      CONSTANTS.LAYOUT
    return [LOGICAL_STRUCTURE, LOGICAL_STRUCTURE_LEFT, MIND_MAP].includes(
      this.mindMap.opt.layout
    )
  }

  // 初始化拖拽会话
  initDragSession() {
    if (!this.isDropTargetLayout()) {
      return
    }
    this.dragSession = {
      sourceNodes: [...this.beingDragNodeList],
      primaryNode: this.mousedownNode,
      startPoint: {
        x: this.mouseDownX,
        y: this.mouseDownY
      },
      currentPoint: {
        x: this.mouseDownX,
        y: this.mouseDownY
      },
      sourceBounds: this.getSourceNodesScreenRect(),
      possibleDrop: null,
      snapTargets: [],
      snapOffset: null
    }
    this.dropTargets = this.computeDropTargets()
    this.snapTargetAnchors = this.computeSnapTargetAnchors()
    this.snapTargets = []
    this.possibleDrop = null
    this.snapOffset = null
  }

  // 自动滚动画布会改变 transform，拖拽中的屏幕命中区域需要同步刷新
  refreshDragGeometry() {
    if (!this.dragSession) {
      return
    }
    this.dropTargets = this.computeDropTargets()
    this.snapTargetAnchors = this.computeSnapTargetAnchors()
    this.dragSession.sourceBounds = this.getSourceNodesScreenRect()
    this.lastDropTargetKey = ''
  }

  // 构建当前布局下所有可命中的放置目标
  computeDropTargets() {
    const targets = []
    const { MIND_MAP } = CONSTANTS.LAYOUT
    const { LEFT, RIGHT } = CONSTANTS.LAYOUT_GROW_DIR
    this.nodeList.forEach(parentNode => {
      if (!this.canUseAsDropParent(parentNode)) {
        return
      }
      if (this.mindMap.opt.layout === MIND_MAP && parentNode.isRoot) {
        targets.push(
          ...this.createVerticalGroupDropTargets(
            parentNode,
            this.getChildrenByDir(parentNode, RIGHT),
            RIGHT
          ),
          ...this.createVerticalGroupDropTargets(
            parentNode,
            this.getChildrenByDir(parentNode, LEFT),
            LEFT
          )
        )
      } else {
        targets.push(
          ...this.createVerticalGroupDropTargets(
            parentNode,
            this.getAvailableChildren(parentNode),
            this.getNewChildNodeDir(parentNode) || RIGHT
          )
        )
      }
    })
    return targets
  }

  // 同级有序命中：把兄弟排序统一转换为 parent + insertionIndex
  createVerticalGroupDropTargets(parentNode, children, dir) {
    const targets = []
    const parentRect = this.getNodeRect(parentNode)
    const { scaleX, scaleY } = this.drawTransform
    const sensitivity = this.getDropTargetSensitivity()
    const startExpansion = 30 * scaleY * sensitivity
    const endExpansion = 20 * scaleY * sensitivity
    const emptyExpansion = 20 * scaleY * sensitivity
    const primaryExpansion = 100 * scaleX * sensitivity
    const secondaryExpansion = 20 * scaleY * sensitivity
    if (children.length === 0) {
      const region = this.createEmptyDropRegion(
        parentRect,
        dir,
        primaryExpansion,
        emptyExpansion
      )
      targets.push({
        type: 'sibling',
        parentNode,
        insertionIndex: this.getInsertionIndexForDir(parentNode, dir, 0),
        dir,
        region,
        indicator: this.createEmptyGroupIndicator(parentNode, dir)
      })
      return targets
    }
    const childRects = children.map(child => {
      const rect = this.getNodeRect(child)
      return {
        child,
        rect,
        branchRect: this.getBranchRect(child),
        centerY: rect.top + (rect.bottom - rect.top) / 2
      }
    })
    for (let index = 0; index <= childRects.length; index++) {
      const prev = index > 0 ? childRects[index - 1] : null
      const next = index < childRects.length ? childRects[index] : null
      const region = this.normalizeRegion(
        this.createInsertionRegion({
          parentRect,
          prev,
          next,
          dir,
          startExpansion,
          endExpansion,
          primaryExpansion,
          secondaryExpansion
        })
      )
      const insertionIndex = this.getInsertionIndexForDir(parentNode, dir, index)
      targets.push({
        type: 'sibling',
        parentNode,
        insertionIndex,
        dir,
        region,
        indicator: this.createDropIndicatorFromTarget(
          parentNode,
          children,
          index,
          dir
        )
      })
    }
    return targets
  }

  createEmptyDropRegion(parentRect, dir, primaryExpansion, emptyExpansion) {
    const { LEFT } = CONSTANTS.LAYOUT_GROW_DIR
    const top = parentRect.top - emptyExpansion
    const bottom = parentRect.bottom + emptyExpansion
    if (dir === LEFT) {
      return {
        left: parentRect.left - primaryExpansion,
        top,
        right: parentRect.left,
        bottom
      }
    }
    return {
      left: parentRect.right,
      top,
      right: parentRect.right + primaryExpansion,
      bottom
    }
  }

  getDropTargetSensitivity() {
    const value = Number(this.mindMap.opt.dragDropTargetSensitivity)
    return Number.isFinite(value) && value > 0 ? value : 1
  }

  normalizeRegion(region) {
    return {
      left: Math.min(region.left, region.right),
      top: Math.min(region.top, region.bottom),
      right: Math.max(region.left, region.right),
      bottom: Math.max(region.top, region.bottom)
    }
  }

  createInsertionRegion({
    parentRect,
    prev,
    next,
    dir,
    startExpansion,
    endExpansion,
    primaryExpansion,
    secondaryExpansion
  }) {
    const { LEFT } = CONSTANTS.LAYOUT_GROW_DIR
    const rects = [prev, next].filter(Boolean)
    const branchRects = rects.map(item => item.branchRect)
    let top
    let bottom
    if (prev && next) {
      top = prev.branchRect.bottom
      bottom = next.branchRect.top
      if (bottom < top) {
        const middle = (prev.centerY + next.centerY) / 2
        top = middle - secondaryExpansion / 2
        bottom = middle + secondaryExpansion / 2
      }
    } else if (next) {
      top = next.branchRect.top - startExpansion
      bottom = next.centerY
    } else if (prev) {
      top = prev.centerY
      bottom = prev.branchRect.bottom + endExpansion
    } else {
      top = parentRect.top - endExpansion
      bottom = parentRect.bottom + endExpansion
    }
    const minLeft = Math.min(parentRect.left, ...branchRects.map(item => item.left))
    const maxRight = Math.max(
      parentRect.right,
      ...branchRects.map(item => item.right)
    )
    if (dir === LEFT) {
      return {
        left: minLeft - primaryExpansion,
        top,
        right: parentRect.left,
        bottom
      }
    }
    return {
      left: parentRect.right,
      top,
      right: maxRight + primaryExpansion,
      bottom
    }
  }

  getInsertionIndexForDir(parentNode, dir, visibleIndex) {
    const available = []
    parentNode.children.forEach((child, index) => {
      if (this.checkIsInBeingDragNodeList(child)) {
        return
      }
      if (
        this.mindMap.opt.layout === CONSTANTS.LAYOUT.MIND_MAP &&
        parentNode.isRoot &&
        child.dir !== dir
      ) {
        return
      }
      available.push(index)
    })
    if (available[visibleIndex] !== undefined) {
      return available[visibleIndex]
    }
    if (available.length > 0) {
      return available[available.length - 1] + 1
    }
    if (
      this.mindMap.opt.layout === CONSTANTS.LAYOUT.MIND_MAP &&
      parentNode.isRoot &&
      dir === CONSTANTS.LAYOUT_GROW_DIR.LEFT
    ) {
      return parentNode.children.length
    }
    return 0
  }

  getBranchRect(node) {
    let rect = this.getNodeRect(node)
    node.children.forEach(child => {
      if (this.checkIsInBeingDragNodeList(child)) {
        return
      }
      rect = this.mergeRects(rect, this.getBranchRect(child))
    })
    return rect
  }

  mergeRects(rect1, rect2) {
    const originLeft = Math.min(rect1.originLeft, rect2.originLeft)
    const originTop = Math.min(rect1.originTop, rect2.originTop)
    const originRight = Math.max(rect1.originRight, rect2.originRight)
    const originBottom = Math.max(rect1.originBottom, rect2.originBottom)
    return {
      left: Math.min(rect1.left, rect2.left),
      top: Math.min(rect1.top, rect2.top),
      right: Math.max(rect1.right, rect2.right),
      bottom: Math.max(rect1.bottom, rect2.bottom),
      originLeft,
      originTop,
      originRight,
      originBottom,
      originWidth: originRight - originLeft,
      originHeight: originBottom - originTop
    }
  }

  createChildDropIndicator(parentNode) {
    const { LEFT } = CONSTANTS.LAYOUT_GROW_DIR
    const rect = this.getNodeRect(parentNode)
    const dir = this.getNewChildNodeDir(parentNode)
    const marginX = this.mindMap.renderer.layout.getMarginX(
      parentNode.layerIndex + 1
    )
    return {
      x:
        dir === LEFT
          ? rect.originLeft - marginX / 2 - this.placeholderWidth
          : rect.originRight + marginX / 2,
      y: rect.originTop + rect.originHeight / 2 - this.placeholderHeight / 2,
      dir
    }
  }

  createEmptyGroupIndicator(parentNode, dir) {
    const { LEFT } = CONSTANTS.LAYOUT_GROW_DIR
    const rect = this.getNodeRect(parentNode)
    const marginX = this.mindMap.renderer.layout.getMarginX(
      parentNode.layerIndex + 1
    )
    return {
      x:
        dir === LEFT
          ? rect.originLeft - marginX / 2 - this.placeholderWidth
          : rect.originRight + marginX / 2,
      y: rect.originTop + rect.originHeight / 2 - this.dropIndicatorHeight / 2,
      dir
    }
  }

  createDropIndicatorFromTarget(parentNode, visibleChildren, visibleIndex, dir) {
    const { LEFT } = CONSTANTS.LAYOUT_GROW_DIR
    const parentRect = this.getNodeRect(parentNode)
    const prevChild = visibleIndex > 0 ? visibleChildren[visibleIndex - 1] : null
    const nextChild =
      visibleIndex < visibleChildren.length ? visibleChildren[visibleIndex] : null
    let baseRect = nextChild
      ? this.getNodeRect(nextChild)
      : prevChild
      ? this.getNodeRect(prevChild)
      : parentRect
    let y
    if (prevChild && nextChild) {
      const prevRect = this.getNodeRect(prevChild)
      const nextRect = this.getNodeRect(nextChild)
      y =
        (prevRect.originBottom + nextRect.originTop) / 2 -
        this.dropIndicatorHeight / 2
      baseRect = nextRect
    } else if (nextChild) {
      y = baseRect.originTop - this.dropIndicatorHeight / 2
    } else if (prevChild) {
      y = baseRect.originBottom - this.dropIndicatorHeight / 2
    } else {
      y =
        parentRect.originTop +
        parentRect.originHeight / 2 -
        this.dropIndicatorHeight / 2
    }
    return {
      x:
        dir === LEFT
          ? baseRect.originRight - this.placeholderWidth
          : baseRect.originLeft,
      y,
      dir
    }
  }

  createSiblingDropIndicator(siblingNode, dir, before) {
    const { LEFT } = CONSTANTS.LAYOUT_GROW_DIR
    const rect = this.getNodeRect(siblingNode)
    return {
      x:
        dir === LEFT
          ? rect.originRight - this.placeholderWidth
          : rect.originLeft,
      y: before
        ? rect.originTop - this.placeholderHeight / 2
        : rect.originBottom - this.placeholderHeight / 2,
      dir
    }
  }

  getChildrenByDir(parentNode, dir) {
    return this.getAvailableChildren(parentNode).filter(child => child.dir === dir)
  }

  getAvailableChildren(parentNode) {
    return parentNode.children.filter(child => {
      return !this.checkIsInBeingDragNodeList(child)
    })
  }

  canUseAsDropParent(parentNode) {
    if (!parentNode || parentNode.isGeneralization) {
      return false
    }
    return this.beingDragNodeList.every(sourceNode => {
      return sourceNode !== parentNode && !sourceNode.isAncestor(parentNode)
    })
  }

  // 命中测试先收集候选，再按更深层节点和节点本体优先级排序
  findDropTarget(point) {
    const matched = []
    for (let i = this.dropTargets.length - 1; i >= 0; i--) {
      const target = this.dropTargets[i]
      if (this.hitTest(point, target.region) && this.isValidDrop(target)) {
        matched.push(target)
      }
    }
    if (!matched.length) {
      return null
    }
    matched.sort((a, b) => {
      return this.getDropTargetPriority(b) - this.getDropTargetPriority(a)
    })
    return matched[0]
  }

  getDropTargetPriority(target) {
    const layerPriority = target.parentNode.layerIndex * 10
    const typePriority = target.type === 'child' ? 5 : 0
    return layerPriority + typePriority
  }

  hitTest(point, region) {
    return (
      point.x >= region.left &&
      point.x <= region.right &&
      point.y >= region.top &&
      point.y <= region.bottom
    )
  }

  isValidDrop(target) {
    if (!target || !target.parentNode) {
      return false
    }
    if (!this.canUseAsDropParent(target.parentNode)) {
      return false
    }
    return !this.isNoopDrop(target)
  }

  isNoopDrop(target) {
    const sameParentNodes = this.beingDragNodeList.filter(node => {
      return node.parent === target.parentNode
    })
    if (sameParentNodes.length !== this.beingDragNodeList.length) {
      return false
    }
    if (
      this.mindMap.opt.layout === CONSTANTS.LAYOUT.MIND_MAP &&
      target.parentNode.isRoot &&
      sameParentNodes.some(node => node.dir !== target.dir)
    ) {
      return false
    }
    const sourceUidSet = new Set(sameParentNodes.map(node => node.uid))
    const siblings = target.parentNode.children
    const sourceOrder = siblings.filter(node => sourceUidSet.has(node.uid))
    const remaining = siblings.filter(node => !sourceUidSet.has(node.uid))
    let insertionIndex = target.insertionIndex
    sourceOrder.forEach(node => {
      const index = getNodeDataIndex(node)
      if (index !== -1 && index < target.insertionIndex) {
        insertionIndex--
      }
    })
    const finalOrder = [...remaining]
    finalOrder.splice(insertionIndex, 0, ...sourceOrder)
    return finalOrder.every((node, index) => {
      return siblings[index] && node.uid === siblings[index].uid
    })
  }

  updateDropTarget() {
    if (!this.dragSession || !this.placeholder) {
      return
    }
    const point = this.dragSession.currentPoint || {
      x: this.mouseMoveX,
      y: this.mouseMoveY
    }
    // 微距范围内不显示落点指示，与松手时的微距取消保持视觉一致
    const nextDrop = this.checkIsMicroMovePos(this.mouseMoveX, this.mouseMoveY)
      ? null
      : this.findDropTarget(point)
    const nextDropKey = this.getDropTargetKey(nextDrop)
    if (nextDropKey !== this.lastDropTargetKey) {
      this.clearDropIndicator()
      if (nextDrop) {
        this.renderDropIndicator(nextDrop)
      }
      this.lastDropTargetKey = nextDropKey
    }
    this.possibleDrop = nextDrop
    this.dragSession.possibleDrop = this.possibleDrop
    this.renderSnapGuides()
  }

  getDropTargetKey(dropTarget) {
    if (!dropTarget) {
      return ''
    }
    return [
      dropTarget.parentNode.uid,
      dropTarget.insertionIndex,
      dropTarget.dir,
      dropTarget.indicator && dropTarget.indicator.x,
      dropTarget.indicator && dropTarget.indicator.y
    ].join('|')
  }

  clearDropIndicator() {
    if (this.placeholder) {
      this.placeholder.size(0, 0)
    }
    if (this.placeHolderLine) {
      this.placeHolderLine.hide()
    }
    this.removeExtraLines()
  }

  renderDropIndicator(dropTarget) {
    const indicator = dropTarget && dropTarget.indicator
    if (!indicator || !this.placeholder) {
      return
    }
    this.placeholder
      .size(this.placeholderWidth, this.dropIndicatorHeight)
      .move(indicator.x, indicator.y)
    this.renderDropConnectionLine(dropTarget)
  }

  renderDropConnectionLine(dropTarget) {
    if (!this.placeHolderLine || !dropTarget || !dropTarget.parentNode) {
      return
    }
    const { dragPlaceholderLineConfig } = this.mindMap.opt
    const parent = dropTarget.parentNode.fakeClone()
    const tmpNode = this.beingDragNodeList[0].fakeClone()
    const indicator = dropTarget.indicator
    tmpNode.dir = dropTarget.dir
    tmpNode.left = indicator.x
    tmpNode.top = indicator.y
    tmpNode.width = this.placeholderWidth
    tmpNode.height = this.dropIndicatorHeight
    tmpNode.parent = parent
    parent.children = [tmpNode]
    parent._lines = []
    this.placeHolderLine.show()
    this.mindMap.renderer.layout.renderLine(
      parent,
      [this.placeHolderLine],
      () => {},
      dropTarget.parentNode.style.getStyle('lineStyle', true)
    )
    this.placeHolderExtraLines = [...parent._lines]
    this.placeHolderExtraLines.forEach(line => {
      this.mindMap.otherDraw.add(line)
      line
        .stroke({
          color: dragPlaceholderLineConfig.color,
          width: dragPlaceholderLineConfig.width
        })
        .fill({ color: 'none' })
    })
  }

  renderSnapGuides() {
    this.removeSnapGuides()
    if (!this.snapTargets.length) {
      return
    }
    const xSnap = this.snapTargets.find(item => {
      return item.snapOffset.y === 0 && item.snapOffset.x !== 0
    })
    const ySnap = this.snapTargets.find(item => {
      return item.snapOffset.x === 0 && item.snapOffset.y !== 0
    })
    if (xSnap) {
      this.drawSnapGuide(
        `M${xSnap.targetPoint.x},${Math.min(
          xSnap.sourcePoint.y,
          xSnap.targetPoint.y
        ) - 20} L${xSnap.targetPoint.x},${Math.max(
          xSnap.sourcePoint.y,
          xSnap.targetPoint.y
        ) + 20}`
      )
    }
    if (ySnap) {
      this.drawSnapGuide(
        `M${Math.min(ySnap.sourcePoint.x, ySnap.targetPoint.x) - 20},${
          ySnap.targetPoint.y
        } L${Math.max(ySnap.sourcePoint.x, ySnap.targetPoint.x) + 20},${
          ySnap.targetPoint.y
        }`
      )
    }
  }

  drawSnapGuide(path) {
    const line = this.mindMap.otherDraw
      .path(path)
      .stroke({
        color: '#2EBDFF',
        width: 1,
        dasharray: '4,4'
      })
      .fill({ color: 'none' })
    this.snapGuideLines.push(line)
  }

  updateDragSessionPoint() {
    if (!this.dragSession) {
      return
    }
    const { x, y } = this.mindMap.toPos(
      this.lastDragClientX,
      this.lastDragClientY
    )
    if (this.isSnapEnabled({ ctrlKey: this.lastDragCtrlKey })) {
      this.snapTargets = this.computeSnapTargets(x, y)
      this.snapOffset = this.resolveSnapOffset(this.snapTargets)
    } else {
      this.snapTargets = []
      this.snapOffset = {
        x: 0,
        y: 0
      }
    }
    this.dragSession.currentPoint = {
      x: x + this.snapOffset.x,
      y: y + this.snapOffset.y
    }
    this.dragSession.snapTargets = this.snapTargets
    this.dragSession.snapOffset = this.snapOffset
  }

  isSnapEnabled(e = {}) {
    const { scaleX, scaleY } = this.drawTransform || this.mindMap.draw.transform()
    return !e.ctrlKey && Math.max(scaleX, scaleY) >= 0.2
  }

  computeSnapTargets(rawX, rawY) {
    if (!this.dragSession) {
      return []
    }
    const threshold = this.mindMap.opt.dragSnapThreshold || 10
    const draggedBounds = this.getDraggedBounds(rawX, rawY)
    const sourceAnchors = this.getSnapAnchors(
      draggedBounds,
      this.beingDragNodeList.length === 1
    )
    const targetAnchors = this.snapTargetAnchors
    const matches = []
    sourceAnchors.forEach(sourcePoint => {
      targetAnchors.forEach(targetPoint => {
        const dx = Math.abs(targetPoint.x - sourcePoint.x)
        const dy = Math.abs(targetPoint.y - sourcePoint.y)
        if (dx < threshold) {
          matches.push({
            sourceBounds: draggedBounds,
            sourcePoint,
            targetPoint,
            targetNode: targetPoint.node,
            snapOffset: {
              x: targetPoint.x - sourcePoint.x,
              y: 0
            }
          })
        }
        if (dy < threshold) {
          matches.push({
            sourceBounds: draggedBounds,
            sourcePoint,
            targetPoint,
            targetNode: targetPoint.node,
            snapOffset: {
              x: 0,
              y: targetPoint.y - sourcePoint.y
            }
          })
        }
      })
    })
    return matches.sort((a, b) => {
      return (
        this.getSnapMagnitude(a.snapOffset) -
        this.getSnapMagnitude(b.snapOffset)
      )
    })
  }

  computeSnapTargetAnchors() {
    const targetAnchors = []
    this.nodeList.forEach(node => {
      if (this.checkIsInBeingDragNodeList(node)) {
        return
      }
      const rect = this.getNodeRect(node)
      this.getSnapAnchors(rect, true).forEach(anchor => {
        targetAnchors.push({
          ...anchor,
          node
        })
      })
    })
    return targetAnchors
  }

  resolveSnapOffset(snapTargets) {
    if (!snapTargets.length) {
      return {
        x: 0,
        y: 0
      }
    }
    const bestX = snapTargets.find(item => {
      return item.snapOffset.y === 0 && item.snapOffset.x !== 0
    })
    const bestY = snapTargets.find(item => {
      return item.snapOffset.x === 0 && item.snapOffset.y !== 0
    })
    return {
      x: bestX ? bestX.snapOffset.x : 0,
      y: bestY ? bestY.snapOffset.y : 0
    }
  }

  getDraggedBounds(rawX, rawY) {
    const { sourceBounds, startPoint } = this.dragSession
    const dx = rawX - startPoint.x
    const dy = rawY - startPoint.y
    return {
      left: sourceBounds.left + dx,
      top: sourceBounds.top + dy,
      right: sourceBounds.right + dx,
      bottom: sourceBounds.bottom + dy
    }
  }

  getSourceNodesScreenRect() {
    return this.beingDragNodeList.reduce((rect, node) => {
      const nodeRect = this.getNodeRect(node)
      return rect ? this.mergeRects(rect, nodeRect) : nodeRect
    }, null)
  }

  getSnapAnchors(rect, includeCenter) {
    const anchors = [
      {
        x: rect.left,
        y: rect.top
      },
      {
        x: rect.right,
        y: rect.top
      },
      {
        x: rect.left,
        y: rect.bottom
      },
      {
        x: rect.right,
        y: rect.bottom
      }
    ]
    if (includeCenter) {
      anchors.push({
        x: rect.left + (rect.right - rect.left) / 2,
        y: rect.top + (rect.bottom - rect.top) / 2
      })
    }
    return anchors
  }

  getSnapMagnitude(offset) {
    return Math.sqrt(offset.x * offset.x + offset.y * offset.y)
  }

  getDropTargetUids(dropTarget) {
    if (!dropTarget) {
      return {
        overlapNodeUid: '',
        prevNodeUid: '',
        nextNodeUid: ''
      }
    }
    const siblings = dropTarget.parentNode.children
    const prevNode = siblings[dropTarget.insertionIndex - 1]
    const nextNode = siblings[dropTarget.insertionIndex]
    return {
      overlapNodeUid:
        dropTarget.type === 'child' ? dropTarget.parentNode.getData('uid') : '',
      prevNodeUid: prevNode ? prevNode.getData('uid') : '',
      nextNodeUid: nextNode ? nextNode.getData('uid') : ''
    }
  }

  // 统一提交 DropTarget，避免继续把决策拆成三套启发式命令。
  commitDrop(sourceNodes, dropTarget) {
    if (!sourceNodes.length || !dropTarget || !this.isValidDrop(dropTarget)) {
      return
    }
    this.mindMap.execCommand(
      'MOVE_NODE_BY_DROP_TARGET',
      sourceNodes,
      dropTarget.parentNode,
      dropTarget.insertionIndex,
      dropTarget.dir
    )
  }

  //  检测重叠节点
  checkOverlapNode() {
    if (!this.drawTransform || !this.placeholder) {
      return
    }
    const {
      LOGICAL_STRUCTURE,
      LOGICAL_STRUCTURE_LEFT,
      MIND_MAP,
      ORGANIZATION_STRUCTURE,
      CATALOG_ORGANIZATION,
      TIMELINE,
      TIMELINE2,
      VERTICAL_TIMELINE,
      VERTICAL_TIMELINE2,
      VERTICAL_TIMELINE3,
      FISHBONE,
      FISHBONE2,
      RIGHT_FISHBONE,
      RIGHT_FISHBONE2
    } = CONSTANTS.LAYOUT
    this.overlapNode = null
    this.prevNode = null
    this.nextNode = null
    this.placeholder.size(0, 0)
    this.placeHolderLine.hide()
    this.removeExtraLines()
    this.nodeList.forEach(node => {
      if (node.getData('isActive')) {
        this.mindMap.execCommand('SET_NODE_ACTIVE', node, false)
      }
      if (this.overlapNode || (this.prevNode && this.nextNode)) {
        return
      }
      switch (this.mindMap.opt.layout) {
        case LOGICAL_STRUCTURE:
        case LOGICAL_STRUCTURE_LEFT:
          this.handleLogicalStructure(node)
          break
        case MIND_MAP:
          this.handleMindMap(node)
          break
        case ORGANIZATION_STRUCTURE:
          this.handleOrganizationStructure(node)
          break
        case CATALOG_ORGANIZATION:
          this.handleCatalogOrganization(node)
          break
        case TIMELINE:
          this.handleTimeLine(node)
          break
        case TIMELINE2:
          this.handleTimeLine2(node)
          break
        case VERTICAL_TIMELINE:
        case VERTICAL_TIMELINE2:
        case VERTICAL_TIMELINE3:
          this.handleLogicalStructure(node)
          break
        case FISHBONE:
        case FISHBONE2:
        case RIGHT_FISHBONE:
        case RIGHT_FISHBONE2:
          this.handleFishbone(node)
          break
        default:
          this.handleLogicalStructure(node)
      }
    })
    // 重叠节点，也就是添加为子节点
    if (this.overlapNode) {
      this.handleOverlapNode()
    }
  }

  // 处理作为子节点的情况
  handleOverlapNode() {
    const {
      LOGICAL_STRUCTURE,
      LOGICAL_STRUCTURE_LEFT,
      MIND_MAP,
      ORGANIZATION_STRUCTURE,
      CATALOG_ORGANIZATION,
      TIMELINE,
      TIMELINE2,
      VERTICAL_TIMELINE,
      VERTICAL_TIMELINE2,
      VERTICAL_TIMELINE3,
      FISHBONE,
      FISHBONE2,
      RIGHT_FISHBONE,
      RIGHT_FISHBONE2
    } = CONSTANTS.LAYOUT
    const { LEFT, TOP, RIGHT, BOTTOM } = CONSTANTS.LAYOUT_GROW_DIR
    const layerIndex = this.overlapNode.layerIndex
    const children = this.overlapNode.children
    const marginX = this.mindMap.renderer.layout.getMarginX(layerIndex + 1)
    const marginY = this.mindMap.renderer.layout.getMarginY(layerIndex + 1)
    const halfPlaceholderWidth = this.placeholderWidth / 2
    const halfPlaceholderHeight = this.placeholderHeight / 2
    let dir = ''
    let x = ''
    let y = ''
    let rotate = false
    let notRenderPlaceholder = false
    // 目标节点存在子节点，那么基于最后一个子节点定位
    if (children.length > 0) {
      const lastChild = children[children.length - 1]
      const lastNodeRect = this.getNodeRect(lastChild)
      dir = this.getNewChildNodeDir(lastChild)
      switch (this.mindMap.opt.layout) {
        case LOGICAL_STRUCTURE:
        case MIND_MAP:
          x =
            dir === LEFT
              ? lastNodeRect.originRight - this.placeholderWidth
              : lastNodeRect.originLeft
          y = lastNodeRect.originBottom + this.minOffset - halfPlaceholderHeight
          break
        case LOGICAL_STRUCTURE_LEFT:
          x = lastNodeRect.originRight - this.placeholderWidth
          y = lastNodeRect.originBottom + this.minOffset - halfPlaceholderHeight
          break
        case ORGANIZATION_STRUCTURE:
          rotate = true
          x = lastNodeRect.originRight + this.minOffset - halfPlaceholderHeight
          y = lastNodeRect.originTop
          break
        case CATALOG_ORGANIZATION:
          if (layerIndex === 0) {
            rotate = true
            x =
              lastNodeRect.originRight + this.minOffset - halfPlaceholderHeight
            y = lastNodeRect.originTop
          } else {
            x = lastNodeRect.originLeft
            y =
              lastNodeRect.originBottom + this.minOffset - halfPlaceholderHeight
          }
          break
        case TIMELINE:
          if (layerIndex === 0) {
            rotate = true
            x =
              lastNodeRect.originRight + this.minOffset - halfPlaceholderHeight
            y =
              lastNodeRect.originTop +
              lastNodeRect.originHeight / 2 -
              halfPlaceholderWidth
          } else {
            x = lastNodeRect.originLeft
            y =
              lastNodeRect.originBottom + this.minOffset - halfPlaceholderHeight
          }
          break
        case TIMELINE2:
          if (layerIndex === 0) {
            rotate = true
            x =
              lastNodeRect.originRight + this.minOffset - halfPlaceholderHeight
            y =
              lastNodeRect.originTop +
              lastNodeRect.originHeight / 2 -
              halfPlaceholderWidth
          } else {
            x = lastNodeRect.originLeft
            if (layerIndex === 1) {
              y =
                dir === TOP
                  ? lastNodeRect.originTop -
                    this.placeholderHeight -
                    this.minOffset +
                    halfPlaceholderHeight
                  : lastNodeRect.originBottom +
                    this.minOffset -
                    halfPlaceholderHeight
            } else {
              y =
                lastNodeRect.originBottom +
                this.minOffset -
                halfPlaceholderHeight
            }
          }
          break
        case VERTICAL_TIMELINE:
        case VERTICAL_TIMELINE2:
        case VERTICAL_TIMELINE3:
          if (layerIndex === 0) {
            x =
              lastNodeRect.originLeft +
              lastNodeRect.originWidth / 2 -
              halfPlaceholderWidth
            y =
              lastNodeRect.originBottom + this.minOffset - halfPlaceholderHeight
          } else {
            x =
              dir === RIGHT
                ? lastNodeRect.originLeft
                : lastNodeRect.originRight - this.placeholderWidth
            y =
              lastNodeRect.originBottom + this.minOffset - halfPlaceholderHeight
          }
          break
        case FISHBONE:
        case FISHBONE2:
        case RIGHT_FISHBONE:
        case RIGHT_FISHBONE2:
          if (layerIndex <= 1) {
            notRenderPlaceholder = true
            this.mindMap.execCommand('SET_NODE_ACTIVE', this.overlapNode, true)
          } else {
            x = lastNodeRect.originLeft
            y =
              dir === TOP
                ? lastNodeRect.originBottom +
                  this.minOffset -
                  halfPlaceholderHeight
                : lastNodeRect.originTop -
                  this.placeholderHeight -
                  this.minOffset +
                  halfPlaceholderHeight
          }
          break
        default:
      }
    } else {
      // 目标节点不存在子节点，那么基于目标节点定位
      const nodeRect = this.getNodeRect(this.overlapNode)
      dir = this.getNewChildNodeDir(this.overlapNode)
      switch (this.mindMap.opt.layout) {
        case LOGICAL_STRUCTURE:
        case MIND_MAP:
          x =
            dir === RIGHT
              ? nodeRect.originRight + marginX
              : nodeRect.originLeft - this.placeholderWidth - marginX
          y =
            nodeRect.originTop +
            (nodeRect.originHeight - this.placeholderHeight) / 2
          break
        case LOGICAL_STRUCTURE_LEFT:
          x = nodeRect.originLeft - this.placeholderWidth - marginX
          y =
            nodeRect.originTop +
            (nodeRect.originHeight - this.placeholderHeight) / 2
          break
        case ORGANIZATION_STRUCTURE:
          rotate = true
          x =
            nodeRect.originLeft +
            (nodeRect.originWidth - this.placeholderHeight) / 2
          y = nodeRect.originBottom + marginX
          break
        case CATALOG_ORGANIZATION:
          if (layerIndex === 0) {
            rotate = true
          }
          x = nodeRect.originLeft + nodeRect.originWidth * 0.5
          y = nodeRect.originBottom + marginX
          break
        case TIMELINE:
          if (layerIndex === 0) {
            rotate = true
          }
          x = nodeRect.originLeft + nodeRect.originWidth * 0.5
          y = nodeRect.originBottom + marginY
          break
        case TIMELINE2:
          if (layerIndex === 0) {
            rotate = true
          }
          x = nodeRect.originLeft + nodeRect.originWidth * 0.5
          if (layerIndex === 1) {
            y =
              dir === TOP
                ? nodeRect.originTop - this.placeholderHeight - marginX
                : nodeRect.originBottom + marginX
          } else {
            y = nodeRect.originBottom + marginX
          }
          break
        case VERTICAL_TIMELINE:
        case VERTICAL_TIMELINE2:
        case VERTICAL_TIMELINE3:
          if (layerIndex === 0) {
            rotate = true
          }
          x =
            dir === RIGHT
              ? nodeRect.originRight + marginX
              : nodeRect.originLeft - this.placeholderWidth - marginX
          y =
            nodeRect.originTop +
            nodeRect.originHeight / 2 -
            halfPlaceholderHeight
          break
        case FISHBONE:
        case FISHBONE2:
        case RIGHT_FISHBONE:
        case RIGHT_FISHBONE2:
          if (layerIndex <= 1) {
            notRenderPlaceholder = true
            this.mindMap.execCommand('SET_NODE_ACTIVE', this.overlapNode, true)
          } else {
            x = nodeRect.originLeft + nodeRect.originWidth * 0.5
            y =
              dir === BOTTOM
                ? nodeRect.originTop -
                  this.placeholderHeight -
                  this.minOffset +
                  halfPlaceholderHeight
                : nodeRect.originBottom + this.minOffset - halfPlaceholderHeight
          }
          break
        default:
      }
    }
    if (!notRenderPlaceholder) {
      this.setPlaceholderRect({
        x,
        y,
        dir,
        rotate
      })
    }
  }

  // 获取节点的生长方向
  getNewChildNodeDir(node) {
    const {
      LOGICAL_STRUCTURE,
      LOGICAL_STRUCTURE_LEFT,
      MIND_MAP,
      TIMELINE2,
      VERTICAL_TIMELINE,
      VERTICAL_TIMELINE2,
      VERTICAL_TIMELINE3,
      FISHBONE,
      FISHBONE2,
      RIGHT_FISHBONE,
      RIGHT_FISHBONE2
    } = CONSTANTS.LAYOUT
    switch (this.mindMap.opt.layout) {
      case LOGICAL_STRUCTURE:
        return CONSTANTS.LAYOUT_GROW_DIR.RIGHT
      case LOGICAL_STRUCTURE_LEFT:
        return CONSTANTS.LAYOUT_GROW_DIR.LEFT
      case MIND_MAP:
      case TIMELINE2:
      case VERTICAL_TIMELINE:
      case VERTICAL_TIMELINE2:
      case VERTICAL_TIMELINE3:
      case FISHBONE:
      case FISHBONE2:
      case RIGHT_FISHBONE:
      case RIGHT_FISHBONE2:
        return node.dir
      default:
        return ''
    }
  }

  // 垂直方向比较
  // isReverse：是否反向
  handleVerticalCheck(node, checkList, isReverse = false) {
    const { layout } = this.mindMap.opt
    const { LAYOUT, LAYOUT_GROW_DIR } = CONSTANTS
    const {
      VERTICAL_TIMELINE,
      VERTICAL_TIMELINE2,
      VERTICAL_TIMELINE3,
      FISHBONE,
      FISHBONE2,
      RIGHT_FISHBONE,
      RIGHT_FISHBONE2
    } = LAYOUT
    const { LEFT } = LAYOUT_GROW_DIR
    const mouseMoveX = this.mouseMoveX
    const mouseMoveY = this.mouseMoveY
    const nodeRect = this.getNodeRect(node)
    const dir = this.getNewChildNodeDir(node)
    const layerIndex = node.layerIndex
    if (isReverse) {
      checkList = checkList.reverse()
    }
    let oneFourthHeight = nodeRect.originHeight / 4
    let { prevBrotherOffset, nextBrotherOffset } =
      this.getNodeDistanceToSiblingNode(checkList, node, nodeRect, 'v')
    if (nodeRect.left <= mouseMoveX && nodeRect.right >= mouseMoveX) {
      // 检测兄弟节点位置
      if (
        !this.overlapNode &&
        !this.prevNode &&
        !this.nextNode &&
        !node.isRoot
      ) {
        let checkIsPrevNode =
          nextBrotherOffset > 0 // 距离下一个兄弟节点的距离大于0
            ? mouseMoveY > nodeRect.bottom &&
              mouseMoveY <= nodeRect.bottom + nextBrotherOffset // 那么在当前节点外底部判断
            : mouseMoveY >= nodeRect.bottom - oneFourthHeight &&
              mouseMoveY <= nodeRect.bottom // 否则在当前节点内底部1/4区间判断
        let checkIsNextNode =
          prevBrotherOffset > 0 // 距离上一个兄弟节点的距离大于0
            ? mouseMoveY < nodeRect.top &&
              mouseMoveY >= nodeRect.top - prevBrotherOffset // 那么在当前节点外底部判断
            : mouseMoveY >= nodeRect.top &&
              mouseMoveY <= nodeRect.top + oneFourthHeight

        const { scaleY } = this.drawTransform
        let x =
          dir === LEFT
            ? nodeRect.originRight - this.placeholderWidth
            : nodeRect.originLeft
        let notRenderLine = false
        switch (layout) {
          case VERTICAL_TIMELINE:
          case VERTICAL_TIMELINE2:
          case VERTICAL_TIMELINE3:
            if (layerIndex === 1) {
              x =
                nodeRect.originLeft +
                nodeRect.originWidth / 2 -
                this.placeholderWidth / 2
            }
            break
          case RIGHT_FISHBONE:
          case RIGHT_FISHBONE2:
            x =
              nodeRect.originLeft + nodeRect.originWidth - this.placeholderWidth
            break
          default:
        }
        if (checkIsPrevNode) {
          if (isReverse) {
            this.nextNode = node
          } else {
            this.prevNode = node
          }
          let y =
            nodeRect.originBottom +
            nextBrotherOffset / scaleY - //nextBrotherOffset已经是实际间距的一半了
            this.placeholderHeight / 2
          switch (layout) {
            case FISHBONE:
            case FISHBONE2:
            case RIGHT_FISHBONE:
            case RIGHT_FISHBONE2:
              if (layerIndex === 2) {
                notRenderLine = true
                y =
                  nodeRect.originBottom +
                  this.minOffset -
                  this.placeholderHeight / 2
              }
              break
            default:
          }
          this.setPlaceholderRect({
            x,
            y,
            dir,
            notRenderLine
          })
        } else if (checkIsNextNode) {
          if (isReverse) {
            this.prevNode = node
          } else {
            this.nextNode = node
          }
          let y =
            nodeRect.originTop -
            this.placeholderHeight -
            prevBrotherOffset / scaleY +
            this.placeholderHeight / 2
          switch (layout) {
            case FISHBONE:
            case FISHBONE2:
            case RIGHT_FISHBONE:
            case RIGHT_FISHBONE2:
              if (layerIndex === 2) {
                notRenderLine = true
                y =
                  nodeRect.originTop -
                  this.placeholderHeight -
                  this.minOffset +
                  this.placeholderHeight / 2
              }
              break
            default:
          }
          this.setPlaceholderRect({
            x,
            y,
            dir,
            notRenderLine
          })
        }
      }
      // 检测是否重叠
      this.checkIsOverlap({
        node,
        dir: 'v',
        prevBrotherOffset,
        nextBrotherOffset,
        size: oneFourthHeight,
        pos: mouseMoveY,
        nodeRect
      })
    }
  }

  // 水平方向比较
  handleHorizontalCheck(node, checkList) {
    const { layout } = this.mindMap.opt
    const { LAYOUT } = CONSTANTS
    const {
      FISHBONE,
      FISHBONE2,
      RIGHT_FISHBONE,
      RIGHT_FISHBONE2,
      TIMELINE,
      TIMELINE2
    } = LAYOUT
    let mouseMoveX = this.mouseMoveX
    let mouseMoveY = this.mouseMoveY
    let nodeRect = this.getNodeRect(node)
    let oneFourthWidth = nodeRect.originWidth / 4
    let { prevBrotherOffset, nextBrotherOffset } =
      this.getNodeDistanceToSiblingNode(checkList, node, nodeRect, 'h')
    if (nodeRect.top <= mouseMoveY && nodeRect.bottom >= mouseMoveY) {
      // 检测兄弟节点位置
      if (
        !this.overlapNode &&
        !this.prevNode &&
        !this.nextNode &&
        !node.isRoot
      ) {
        let checkIsPrevNode =
          nextBrotherOffset > 0 // 距离下一个兄弟节点的距离大于0
            ? mouseMoveX < nodeRect.right + nextBrotherOffset &&
              mouseMoveX >= nodeRect.right // 那么在当前节点外底部判断
            : mouseMoveX <= nodeRect.right &&
              mouseMoveX >= nodeRect.right - oneFourthWidth // 否则在当前节点内底部1/4区间判断
        let checkIsNextNode =
          prevBrotherOffset > 0 // 距离上一个兄弟节点的距离大于0
            ? mouseMoveX > nodeRect.left - prevBrotherOffset &&
              mouseMoveX <= nodeRect.left // 那么在当前节点外底部判断
            : mouseMoveX <= nodeRect.left + oneFourthWidth &&
              mouseMoveX >= nodeRect.left
        const { scaleX } = this.drawTransform
        const layerIndex = node.layerIndex
        let y = nodeRect.originTop
        let notRenderLine = false
        switch (layout) {
          case TIMELINE:
          case TIMELINE2:
            y =
              nodeRect.originTop +
              nodeRect.originHeight / 2 -
              this.placeholderWidth / 2
            break
          case FISHBONE:
          case FISHBONE2:
          case RIGHT_FISHBONE:
          case RIGHT_FISHBONE2:
            if (layerIndex === 1) {
              notRenderLine = true
              y =
                nodeRect.originTop +
                nodeRect.originHeight / 2 -
                this.placeholderWidth / 2
            }
            break
          default:
        }
        if (checkIsPrevNode) {
          if ([RIGHT_FISHBONE, RIGHT_FISHBONE2].includes(layout)) {
            this.nextNode = node
          } else {
            this.prevNode = node
          }
          this.setPlaceholderRect({
            x:
              nodeRect.originRight +
              nextBrotherOffset / scaleX - //nextBrotherOffset已经是实际间距的一半了
              this.placeholderHeight / 2,
            y,
            rotate: true,
            notRenderLine
          })
        } else if (checkIsNextNode) {
          if ([RIGHT_FISHBONE, RIGHT_FISHBONE2].includes(layout)) {
            this.prevNode = node
          } else {
            this.nextNode = node
          }
          this.setPlaceholderRect({
            x:
              nodeRect.originLeft -
              this.placeholderHeight -
              prevBrotherOffset / scaleX +
              this.placeholderHeight / 2,
            y,
            rotate: true,
            notRenderLine
          })
        }
      }
      // 检测是否重叠
      this.checkIsOverlap({
        node,
        dir: 'h',
        prevBrotherOffset,
        nextBrotherOffset,
        size: oneFourthWidth,
        pos: mouseMoveX,
        nodeRect
      })
    }
  }

  // 获取节点距前一个和后一个节点的距离
  getNodeDistanceToSiblingNode(checkList, node, nodeRect, dir) {
    const { TOP, LEFT, BOTTOM, RIGHT } = CONSTANTS.LAYOUT_GROW_DIR
    let { scaleX, scaleY } = this.drawTransform
    let dir1 = dir === 'v' ? TOP : LEFT
    let dir2 = dir === 'v' ? BOTTOM : RIGHT
    let scale = dir === 'v' ? scaleY : scaleX
    let minOffset = this.minOffset * scale
    let index = getNodeIndexInNodeList(node, checkList)
    let prevBrother = null
    let nextBrother = null
    if (index !== -1) {
      if (index - 1 >= 0) {
        prevBrother = checkList[index - 1]
      }
      if (index + 1 <= checkList.length - 1) {
        nextBrother = checkList[index + 1]
      }
    }
    // 和前一个兄弟节点的距离
    let prevBrotherOffset = 0
    if (prevBrother) {
      let prevNodeRect = this.getNodeRect(prevBrother)
      prevBrotherOffset = nodeRect[dir1] - prevNodeRect[dir2]
      // 间距小于10就当它不存在
      prevBrotherOffset =
        prevBrotherOffset >= minOffset ? prevBrotherOffset / 2 : 0
    } else {
      // 没有前一个兄弟节点，那么假设和前一个节点的距离为20
      prevBrotherOffset = minOffset
    }
    // 和后一个兄弟节点的距离
    let nextBrotherOffset = 0
    if (nextBrother) {
      let nextNodeRect = this.getNodeRect(nextBrother)
      nextBrotherOffset = nextNodeRect[dir1] - nodeRect[dir2]
      nextBrotherOffset =
        nextBrotherOffset >= minOffset ? nextBrotherOffset / 2 : 0
    } else {
      nextBrotherOffset = minOffset
    }
    return {
      prevBrother,
      prevBrotherOffset,
      nextBrother,
      nextBrotherOffset
    }
  }

  // 设置提示元素的大小和位置
  setPlaceholderRect({ x, y, dir, rotate, notRenderLine }) {
    let w = this.placeholderWidth
    let h = this.placeholderHeight
    if (rotate) {
      const tmp = w
      w = h
      h = tmp
    }
    this.placeholder.size(w, h).move(x, y)
    if (notRenderLine) {
      return
    }
    const { dragPlaceholderLineConfig } = this.mindMap.opt
    let node = null
    let parent = null
    if (this.overlapNode) {
      node = this.overlapNode
      parent = this.overlapNode
    } else {
      node = this.prevNode || this.nextNode
      parent = node.parent
    }
    parent = parent.fakeClone()
    node = node.fakeClone()
    const tmpNode = this.beingDragNodeList[0].fakeClone()
    tmpNode.dir = dir
    tmpNode.left = x
    tmpNode.top = y
    tmpNode.width = w
    tmpNode.height = h
    parent.children = [tmpNode]
    parent._lines = []
    this.placeHolderLine.show()
    this.mindMap.renderer.layout.renderLine(
      parent,
      [this.placeHolderLine],
      (...args) => {
        // node.styleLine(...args)
      },
      node.style.getStyle('lineStyle', true)
    )
    this.placeHolderExtraLines = [...parent._lines]
    this.placeHolderExtraLines.forEach(line => {
      this.mindMap.otherDraw.add(line)
      line
        .stroke({
          color: dragPlaceholderLineConfig.color,
          width: dragPlaceholderLineConfig.width
        })
        .fill({ color: 'none' })
    })
  }

  // 检测是否重叠
  checkIsOverlap({
    node,
    dir,
    prevBrotherOffset,
    nextBrotherOffset,
    size,
    pos,
    nodeRect
  }) {
    const { TOP, LEFT, BOTTOM, RIGHT } = CONSTANTS.LAYOUT_GROW_DIR
    let dir1 = dir === 'v' ? TOP : LEFT
    let dir2 = dir === 'v' ? BOTTOM : RIGHT
    if (!this.overlapNode && !this.prevNode && !this.nextNode) {
      if (
        nodeRect[dir1] + (prevBrotherOffset > 0 ? 0 : size) <= pos &&
        nodeRect[dir2] - (nextBrotherOffset > 0 ? 0 : size) >= pos
      ) {
        this.overlapNode = node
      }
    }
  }

  // 处理逻辑结构图
  handleLogicalStructure(node) {
    const checkList = this.commonGetNodeCheckList(node)
    this.handleVerticalCheck(node, checkList)
  }

  // 处理思维导图
  handleMindMap(node) {
    const checkList = node.parent
      ? node.parent.children.filter(item => {
          let sameDir = true
          if (node.layerIndex === 1) {
            sameDir = item.dir === node.dir
          }
          return sameDir && !this.checkIsInBeingDragNodeList(item)
        })
      : []
    this.handleVerticalCheck(node, checkList)
  }

  // 处理组织结构图
  handleOrganizationStructure(node) {
    const checkList = this.commonGetNodeCheckList(node)
    this.handleHorizontalCheck(node, checkList)
  }

  // 处理目录组织图
  handleCatalogOrganization(node) {
    const checkList = this.commonGetNodeCheckList(node)
    if (node.layerIndex === 1) {
      this.handleHorizontalCheck(node, checkList)
    } else {
      this.handleVerticalCheck(node, checkList)
    }
  }

  // 处理时间轴
  handleTimeLine(node) {
    let checkList = this.commonGetNodeCheckList(node)
    if (node.layerIndex === 1) {
      this.handleHorizontalCheck(node, checkList)
    } else {
      this.handleVerticalCheck(node, checkList)
    }
  }

  // 处理时间轴2
  handleTimeLine2(node) {
    let checkList = this.commonGetNodeCheckList(node)
    if (node.layerIndex === 1) {
      this.handleHorizontalCheck(node, checkList)
    } else {
      // 处于上方的三级节点需要特殊处理，因为节点排列方向反向了
      if (node.dir === CONSTANTS.LAYOUT_GROW_DIR.TOP && node.layerIndex === 2) {
        this.handleVerticalCheck(node, checkList, true)
      } else {
        this.handleVerticalCheck(node, checkList)
      }
    }
  }

  // 处理鱼骨图
  handleFishbone(node) {
    let checkList = node.parent
      ? node.parent.children.filter(item => {
          return item.layerIndex > 1 && !this.checkIsInBeingDragNodeList(item)
        })
      : []
    if (node.layerIndex === 1) {
      this.handleHorizontalCheck(node, checkList)
    } else {
      // 处于上方的三级节点需要特殊处理，因为节点排列方向反向了
      const is2LayerTop =
        node.dir === CONSTANTS.LAYOUT_GROW_DIR.TOP && node.layerIndex === 2
      const is2MoreLayerBottom =
        node.dir === CONSTANTS.LAYOUT_GROW_DIR.BOTTOM && node.layerIndex >= 3
      if (is2LayerTop || is2MoreLayerBottom) {
        this.handleVerticalCheck(node, checkList, true)
      } else {
        this.handleVerticalCheck(node, checkList)
      }
    }
  }

  // 获取节点的兄弟节点列表通用方法
  commonGetNodeCheckList(node) {
    return node.parent
      ? [...node.parent.children].filter(item => {
          return !this.checkIsInBeingDragNodeList(item)
        })
      : []
  }

  // 计算节点的位置尺寸信息
  getNodeRect(node) {
    let { scaleX, scaleY, translateX, translateY } = this.drawTransform
    let { left, top, width, height } = node
    let originWidth = width
    let originHeight = height
    let originLeft = left
    let originTop = top
    let originBottom = top + height
    let originRight = left + width
    let right = (left + width) * scaleX + translateX
    let bottom = (top + height) * scaleY + translateY
    left = left * scaleX + translateX
    top = top * scaleY + translateY
    return {
      left,
      top,
      right,
      bottom,
      originWidth,
      originHeight,
      originLeft,
      originTop,
      originBottom,
      originRight
    }
  }

  // 检查某个节点是否在被拖拽节点内
  checkIsInBeingDragNodeList(node) {
    return !!this.beingDragNodeList.find(item => {
      return item.uid === node.uid || item.isAncestor(node)
    })
  }

  // 插件被移除前做的事情
  beforePluginRemove() {
    this.unBindEvent()
  }

  // 插件被卸载前做的事情
  beforePluginDestroy() {
    this.unBindEvent()
  }
}

Drag.instanceName = 'drag'

export default Drag
