import merge from 'deepmerge'
import LogicalStructure from '../../layouts/LogicalStructure'
import MindMap from '../../layouts/MindMap'
import CatalogOrganization from '../../layouts/CatalogOrganization'
import OrganizationStructure from '../../layouts/OrganizationStructure'
import Timeline from '../../layouts/Timeline'
import VerticalTimeline from '../../layouts/VerticalTimeline'
import Fishbone from '../../layouts/Fishbone'
import TextEdit from './TextEdit'
import {
  copyNodeTree,
  simpleDeepClone,
  walk,
  bfsWalk,
  loadImage,
  isUndef,
  getTopAncestorsFomNodeList,
  addDataToAppointNodes,
  createUidForAppointNodes,
  formatDataToArray,
  removeFromParentNodeData,
  createUid,
  getNodeDataIndex,
  getNodeIndexInNodeList,
  setDataToClipboard,
  getDataFromClipboard,
  htmlEscape,
  parseAddGeneralizationNodeList,
  checkNodeListIsEqual,
  createSmmFormatData,
  checkSmmFormatData,
  checkIsNodeStyleDataKey,
  formatGetNodeGeneralization,
  sortNodeList,
  throttle,
  checkClipboardReadEnable,
  isNodeNotNeedRenderData,
  getRenderTreeFromHistorySnapshot,
  fitPastedImageSizeToNodeText
} from '../../utils'
import {
  createNodeInvalidationState,
  invalidateNodes,
  INVALIDATE,
  markNodeMoveInvalidation,
  markTreeStructureInvalidation
} from './nodeInvalidate'
import { createRenderOrchestrator } from './renderOrchestrator'
import { shapeList } from './node/Shape'
import { lineStyleProps } from '../../theme/default'
import { CONSTANTS, ERROR_TYPES } from '../../constants/constant'
import { Polygon } from '@svgdotjs/svg.js'

// 布局列表
const layouts = {
  // 逻辑结构图
  [CONSTANTS.LAYOUT.LOGICAL_STRUCTURE]: LogicalStructure,
  // 向左逻辑结构图
  [CONSTANTS.LAYOUT.LOGICAL_STRUCTURE_LEFT]: LogicalStructure,
  // 思维导图
  [CONSTANTS.LAYOUT.MIND_MAP]: MindMap,
  // 目录组织图
  [CONSTANTS.LAYOUT.CATALOG_ORGANIZATION]: CatalogOrganization,
  // 组织结构图
  [CONSTANTS.LAYOUT.ORGANIZATION_STRUCTURE]: OrganizationStructure,
  // 时间轴
  [CONSTANTS.LAYOUT.TIMELINE]: Timeline,
  // 时间轴2
  [CONSTANTS.LAYOUT.TIMELINE2]: Timeline,
  // 竖向时间轴
  [CONSTANTS.LAYOUT.VERTICAL_TIMELINE]: VerticalTimeline,
  // 竖向时间轴2
  [CONSTANTS.LAYOUT.VERTICAL_TIMELINE2]: VerticalTimeline,
  // 竖向时间轴3
  [CONSTANTS.LAYOUT.VERTICAL_TIMELINE3]: VerticalTimeline,
  // 鱼骨图
  [CONSTANTS.LAYOUT.FISHBONE]: Fishbone,
  // 鱼骨图2
  [CONSTANTS.LAYOUT.FISHBONE2]: Fishbone
}

//  渲染
class Render {
  //  构造函数
  constructor(opt = {}) {
    this.opt = opt
    this.mindMap = opt.mindMap
    this.themeConfig = this.mindMap.themeConfig
    // 渲染树，操作过程中修改的都是这里的数据
    this.renderTree = this.mindMap.opt.data
      ? merge({}, this.mindMap.opt.data)
      : null
    // 待处理的渲染请求（登记合并层），渲染pass开始时原子取走
    // full为true表示需要清场全量重建（清缓存、清画布、重建节点实例）
    this.pendingRenderRequest = null
    // 当前渲染pass是否为全量重建，由pass生命周期维护，外部只读
    this.reRender = false
    // 是否正在渲染中
    this.isRendering = false
    // 用于缓存节点
    this.nodeCache = {}
    this.lastNodeCache = {}
    // 收集触发render的来源
    this.renderSourceList = []
    // 收集render的回调函数
    this.renderCallbackList = []
    // 当前激活的节点列表
    this.activeNodeList = []
    // 防抖定时器
    this.emitNodeActiveEventTimer = null
    this.renderTimer = null
    // 非布局类重渲染结束后恢复视口（渲染请求队列静止时统一恢复）
    this.pendingViewRestore = null
    // 根节点
    this.root = null
    // 节点内容失效登记（突变层显式标脏，布局层消费）
    this.nodeInvalidation = createNodeInvalidationState()
    // 渲染代际登记（renderGeneration字段由orchestrator初始化并独占维护）
    this.renderOrchestrator = createRenderOrchestrator(this)
    this.pendingInsertEditNodes = []
    // 文本编辑框，需要再bindEvent之前实例化，否则单击事件只能触发隐藏文本编辑框，而无法保存文本修改
    this.textEdit = new TextEdit(this)
    // 当前复制的数据
    this.beingCopyData = null
    // 节点高亮框
    this.highlightBoxNode = null
    this.highlightBoxNodeStyle = null
    // 上一次节点激活数据
    this.lastActiveNodeList = []
    // 布局
    this.setLayout()
    // 绑定事件
    this.bindEvent()
    // 注册命令
    this.registerCommands()
    // 注册快捷键
    this.registerShortcutKeys()
  }

  //  设置布局结构
  setLayout() {
    if (this.layout && this.layout.beforeChange) {
      this.layout.beforeChange()
    }
    const { layout } = this.mindMap.opt
    let L = layouts[layout] || this.mindMap[layout]
    if (!L) {
      L = layouts[CONSTANTS.LAYOUT.LOGICAL_STRUCTURE]
      this.mindMap.opt.layout = CONSTANTS.LAYOUT.LOGICAL_STRUCTURE
    }
    this.layout = new L(this, layout)
  }

  // 重新设置思维导图数据
  setData(data) {
    this.renderTree = data || null
  }

  //   绑定事件
  bindEvent() {
    const {
      openPerformance,
      performanceConfig,
      openRealtimeRenderOnNodeTextEdit
    } = this.mindMap.opt
    // 画布点击事件清除当前激活节点列表
    this.mindMap.on('draw_click', e => {
      this.clearActiveNodeListOnDrawClick(e, 'click')
    })
    // 画布右键事件事件清除当前激活节点列表
    this.mindMap.on('contextmenu', e => {
      this.clearActiveNodeListOnDrawClick(e, 'contextmenu')
    })
    // 鼠标双击回到根节点
    this.mindMap.svg.on('dblclick', () => {
      if (!this.mindMap.opt.enableDblclickBackToRootNode) return
      this.setRootNodeCenter()
    })
    // 性能模式
    const onViewDataChange = throttle(() => {
      if (!this.renderTree) {
        return
      }
      if (this.root) {
        this.mindMap.emit('node_tree_render_start')
        this.root.render(
          () => {
            this.mindMap.emit('node_tree_render_end')
          },
          false,
          true
        )
      }
    }, performanceConfig.time)
    if (openPerformance) {
      this.mindMap.on('view_data_change', onViewDataChange)
    }
    // 文本编辑时实时更新节点大小：按固定间隔节流并总是消费最新文本。
    // 纯 trailing 防抖在连续输入时会被不断重置，中途不更新、停顿时集中
    // 爆发，造成不跟手；工具库的 throttle 又只会带首次事件的旧文本
    this.onNodeTextEditChange = this.createLatestArgsThrottle(
      this.onNodeTextEditChange.bind(this),
      100
    )
    if (openRealtimeRenderOnNodeTextEdit) {
      this.mindMap.on('node_text_edit_change', this.onNodeTextEditChange)
    }
    // 监听配置改变事件
    this.mindMap.on('after_update_config', (opt, lastOpt) => {
      // 更新openPerformance配置
      if (opt.openPerformance !== lastOpt.openPerformance) {
        this.mindMap[opt.openPerformance ? 'on' : 'off'](
          'view_data_change',
          onViewDataChange
        )
        this.forceLoadNode()
      }
      // 更新openRealtimeRenderOnNodeTextEdit配置
      if (
        opt.openRealtimeRenderOnNodeTextEdit !==
        lastOpt.openRealtimeRenderOnNodeTextEdit
      ) {
        this.mindMap[opt.openRealtimeRenderOnNodeTextEdit ? 'on' : 'off'](
          'node_text_edit_change',
          this.onNodeTextEditChange
        )
      }
    })
    // 处理非https下的复制黏贴问题
    // 暂时不启用，因为给页面的其他输入框（比如节点文本编辑框）粘贴内容也会触发，冲突问题暂时没有想到好的解决方法，不可能要求所有输入框都阻止冒泡
    // if (!checkClipboardReadEnable()) {
    //   this.handlePaste = this.handlePaste.bind(this)
    //   window.addEventListener('paste', this.handlePaste)
    //   this.mindMap.on('beforeDestroy', () => {
    //     window.removeEventListener('paste', this.handlePaste)
    //   })
    // }
  }

  // 节流执行，且触发时总是消费最新一次的参数
  createLatestArgsThrottle(fn, wait) {
    let timer = null
    let latestArgs = null
    return (...args) => {
      latestArgs = args
      if (timer) {
        return
      }
      timer = setTimeout(() => {
        timer = null
        fn(...latestArgs)
      }, wait)
    }
  }

  // 监听文本编辑事件，实时更新节点大小。
  // 注意这里不能把节点标记为文本失效：下面触发的整树渲染会消费失效标记、
  // 改按 data 里尚未提交的旧文本重新测量，节点尺寸被打回去，造成编辑时
  // 高频闪烁、停止输入后文字溢出节点。编辑提交时 setNodeDataRender 会
  // 标记失效并按最终文本重测，无需在此处理
  onNodeTextEditChange({ node, text }) {
    if (!node) {
      return
    }
    // reRender 的返回值含"内容指纹变化"，打字时每个字都为真；
    // 整树重排只关心宽高是否真的变了（长文本到达换行宽度后大多数
    // 键入不再改变尺寸），尺寸不变时只需让编辑框跟随本节点重绘
    const { width, height } = node
    node.reRender(['text'], { specifyText: text })
    const sizeChange = node.width !== width || node.height !== height
    if (sizeChange) {
      this.mindMap.render(() => {
        this.textEdit.updateTextEditNode()
      }, 'text-edit-resize')
    } else {
      this.textEdit.updateTextEditNode()
    }
  }

  invalidateTextContent(uid) {
    if (!uid) {
      return
    }
    invalidateNodes(this.nodeInvalidation, uid, INVALIDATE.TEXT_CONTENT)
  }

  markTreeStructureDirty(parentUid, newChildUid) {
    markTreeStructureInvalidation(this.nodeInvalidation, {
      parentUid,
      newChildUid,
      resolveParentNode: uid => this.findNodeByUid(uid)
    })
  }

  markNodeMoveDirty(movedNodes, targetParent = null) {
    markNodeMoveInvalidation(this.nodeInvalidation, {
      movedNodes: formatDataToArray(movedNodes),
      targetParent
    })
  }

  // 只记录uid：全量重建会替换节点实例，兑现时再解析最新实例
  queueOpenAfterInsert(node) {
    if (!node || !node.uid) {
      return
    }
    if (!this.pendingInsertEditNodes.includes(node.uid)) {
      this.pendingInsertEditNodes.push(node.uid)
    }
  }

  flushPendingInsertEdits() {
    const pending = this.pendingInsertEditNodes.splice(0)
    pending.forEach(uid => {
      const node = this.findNodeByUid(uid)
      if (node) {
        this.textEdit.openAfterInsert(node)
      }
    })
  }

  // 强制渲染节点，不考虑是否在画布可视区域内
  forceLoadNode(node) {
    node = node || this.root
    if (node) {
      this.mindMap.emit('node_tree_render_start')
      node.render(() => {
        this.mindMap.emit('node_tree_render_end')
      }, true)
    }
  }

  //  注册命令
  registerCommands() {
    // 全选
    this.selectAll = this.selectAll.bind(this)
    this.mindMap.command.add('SELECT_ALL', this.selectAll)
    // 回退
    this.back = this.back.bind(this)
    this.mindMap.command.add('BACK', this.back)
    // 前进
    this.forward = this.forward.bind(this)
    this.mindMap.command.add('FORWARD', this.forward)
    // 插入同级节点
    this.insertNode = this.insertNode.bind(this)
    this.mindMap.command.add('INSERT_NODE', this.insertNode)
    // 插入多个同级节点
    this.insertMultiNode = this.insertMultiNode.bind(this)
    this.mindMap.command.add('INSERT_MULTI_NODE', this.insertMultiNode)
    // 插入子节点
    this.insertChildNode = this.insertChildNode.bind(this)
    this.mindMap.command.add('INSERT_CHILD_NODE', this.insertChildNode)
    // 插入多个子节点
    this.insertMultiChildNode = this.insertMultiChildNode.bind(this)
    this.mindMap.command.add(
      'INSERT_MULTI_CHILD_NODE',
      this.insertMultiChildNode
    )
    // 插入父节点
    this.insertParentNode = this.insertParentNode.bind(this)
    this.mindMap.command.add('INSERT_PARENT_NODE', this.insertParentNode)
    // 上移节点
    this.upNode = this.upNode.bind(this)
    this.mindMap.command.add('UP_NODE', this.upNode)
    // 下移节点
    this.downNode = this.downNode.bind(this)
    this.mindMap.command.add('DOWN_NODE', this.downNode)
    //  将一个节点上移一个层级
    this.moveUpOneLevel = this.moveUpOneLevel.bind(this)
    this.mindMap.command.add('MOVE_UP_ONE_LEVEL', this.moveUpOneLevel)
    // 移动节点
    this.insertAfter = this.insertAfter.bind(this)
    this.mindMap.command.add('INSERT_AFTER', this.insertAfter)
    this.insertBefore = this.insertBefore.bind(this)
    this.mindMap.command.add('INSERT_BEFORE', this.insertBefore)
    this.moveNodeTo = this.moveNodeTo.bind(this)
    this.mindMap.command.add('MOVE_NODE_TO', this.moveNodeTo)
    this.moveNodeByDropTarget = this.moveNodeByDropTarget.bind(this)
    this.mindMap.command.add(
      'MOVE_NODE_BY_DROP_TARGET',
      this.moveNodeByDropTarget
    )
    // 删除节点
    this.removeNode = this.removeNode.bind(this)
    this.mindMap.command.add('REMOVE_NODE', this.removeNode)
    // 仅删除当前节点
    this.removeCurrentNode = this.removeCurrentNode.bind(this)
    this.mindMap.command.add('REMOVE_CURRENT_NODE', this.removeCurrentNode)
    // 粘贴节点
    this.pasteNode = this.pasteNode.bind(this)
    this.mindMap.command.add('PASTE_NODE', this.pasteNode)
    // 剪切节点
    this.cutNode = this.cutNode.bind(this)
    this.mindMap.command.add('CUT_NODE', this.cutNode)
    // 修改节点单个样式
    this.setNodeStyle = this.setNodeStyle.bind(this)
    this.mindMap.command.add('SET_NODE_STYLE', this.setNodeStyle)
    // 修改节点多个样式
    this.setNodeStyles = this.setNodeStyles.bind(this)
    this.mindMap.command.add('SET_NODE_STYLES', this.setNodeStyles)
    // 切换节点是否激活
    this.setNodeActive = this.setNodeActive.bind(this)
    this.mindMap.command.add('SET_NODE_ACTIVE', this.setNodeActive)
    // 清除所有激活节点
    this.clearActiveNode = this.clearActiveNode.bind(this)
    this.mindMap.command.add('CLEAR_ACTIVE_NODE', this.clearActiveNode)
    // 切换节点是否展开
    this.setNodeExpand = this.setNodeExpand.bind(this)
    this.mindMap.command.add('SET_NODE_EXPAND', this.setNodeExpand)
    // 展开所有节点
    this.expandAllNode = this.expandAllNode.bind(this)
    this.mindMap.command.add('EXPAND_ALL', this.expandAllNode)
    // 收起所有节点
    this.unexpandAllNode = this.unexpandAllNode.bind(this)
    this.mindMap.command.add('UNEXPAND_ALL', this.unexpandAllNode)
    // 展开到指定层级
    this.expandToLevel = this.expandToLevel.bind(this)
    this.mindMap.command.add('UNEXPAND_TO_LEVEL', this.expandToLevel)
    // 设置节点数据
    this.setNodeData = this.setNodeData.bind(this)
    this.mindMap.command.add('SET_NODE_DATA', this.setNodeData)
    // 设置节点文本
    this.setNodeText = this.setNodeText.bind(this)
    this.mindMap.command.add('SET_NODE_TEXT', this.setNodeText)
    // 设置节点图片
    this.setNodeImage = this.setNodeImage.bind(this)
    this.mindMap.command.add('SET_NODE_IMAGE', this.setNodeImage)
    // 设置节点图标
    this.setNodeIcon = this.setNodeIcon.bind(this)
    this.mindMap.command.add('SET_NODE_ICON', this.setNodeIcon)
    // 设置节点超链接
    this.setNodeHyperlink = this.setNodeHyperlink.bind(this)
    this.mindMap.command.add('SET_NODE_HYPERLINK', this.setNodeHyperlink)
    // 设置节点备注
    this.setNodeNote = this.setNodeNote.bind(this)
    this.mindMap.command.add('SET_NODE_NOTE', this.setNodeNote)
    // 设置节点附件
    this.setNodeAttachment = this.setNodeAttachment.bind(this)
    this.mindMap.command.add('SET_NODE_ATTACHMENT', this.setNodeAttachment)
    // 设置节点标签
    this.setNodeTag = this.setNodeTag.bind(this)
    this.mindMap.command.add('SET_NODE_TAG', this.setNodeTag)
    // 设置节点公式
    this.insertFormula = this.insertFormula.bind(this)
    this.mindMap.command.add('INSERT_FORMULA', this.insertFormula)
    // 添加节点概要
    this.addGeneralization = this.addGeneralization.bind(this)
    this.mindMap.command.add('ADD_GENERALIZATION', this.addGeneralization)
    // 删除节点概要
    this.removeGeneralization = this.removeGeneralization.bind(this)
    this.mindMap.command.add('REMOVE_GENERALIZATION', this.removeGeneralization)
    // 设置节点自定义位置
    this.setNodeCustomPosition = this.setNodeCustomPosition.bind(this)
    this.mindMap.command.add(
      'SET_NODE_CUSTOM_POSITION',
      this.setNodeCustomPosition
    )
    // 一键整理布局
    this.resetLayout = this.resetLayout.bind(this)
    this.mindMap.command.add('RESET_LAYOUT', this.resetLayout)
    // 设置节点形状
    this.setNodeShape = this.setNodeShape.bind(this)
    this.mindMap.command.add('SET_NODE_SHAPE', this.setNodeShape)
    // 定位节点
    this.goTargetNode = this.goTargetNode.bind(this)
    this.mindMap.command.add('GO_TARGET_NODE', this.goTargetNode)
    // 一键去除节点自定义样式
    this.removeCustomStyles = this.removeCustomStyles.bind(this)
    this.mindMap.command.add('REMOVE_CUSTOM_STYLES', this.removeCustomStyles)
    // 一键去除所有节点自定义样式
    this.removeAllNodeCustomStyles = this.removeAllNodeCustomStyles.bind(this)
    this.mindMap.command.add(
      'REMOVE_ALL_NODE_CUSTOM_STYLES',
      this.removeAllNodeCustomStyles
    )
  }

  //  注册快捷键
  registerShortcutKeys() {
    // 插入下级节点
    this.mindMap.keyCommand.addShortcut('Tab', () => {
      this.mindMap.execCommand('INSERT_CHILD_NODE')
    })
    // 插入下级节点
    this.mindMap.keyCommand.addShortcut('Insert', () => {
      this.mindMap.execCommand('INSERT_CHILD_NODE')
    })
    // 插入同级节点
    this.mindMap.keyCommand.addShortcut('Enter', () => {
      this.mindMap.execCommand('INSERT_NODE')
    })
    // 插入父节点
    this.mindMap.keyCommand.addShortcut('Shift+Tab', () => {
      this.mindMap.execCommand('INSERT_PARENT_NODE')
    })
    // 插入概要
    this.mindMap.keyCommand.addShortcut('Control+g', () => {
      this.mindMap.execCommand('ADD_GENERALIZATION')
    })
    // 展开/收起节点
    this.toggleActiveExpand = this.toggleActiveExpand.bind(this)
    this.mindMap.keyCommand.addShortcut('/', this.toggleActiveExpand)
    // 删除节点
    this.mindMap.keyCommand.addShortcut('Del|Backspace', () => {
      this.mindMap.execCommand('REMOVE_NODE')
    })
    // 仅删除当前节点
    this.mindMap.keyCommand.addShortcut('Shift+Backspace', () => {
      this.mindMap.execCommand('REMOVE_CURRENT_NODE')
    })
    // 节点编辑时某些快捷键会存在冲突，需要暂时去除
    this.mindMap.on('before_show_text_edit', () => {
      this.startTextEdit()
    })
    this.mindMap.on('hide_text_edit', () => {
      this.endTextEdit()
    })
    // 全选
    this.mindMap.keyCommand.addShortcut('Control+a', () => {
      this.mindMap.execCommand('SELECT_ALL')
    })
    // 一键整理布局
    this.mindMap.keyCommand.addShortcut('Control+l', () => {
      this.mindMap.execCommand('RESET_LAYOUT')
    })
    // 上移节点
    this.mindMap.keyCommand.addShortcut('Control+Up', () => {
      this.mindMap.execCommand('UP_NODE')
    })
    // 下移节点
    this.mindMap.keyCommand.addShortcut('Control+Down', () => {
      this.mindMap.execCommand('DOWN_NODE')
    })
    // 复制节点
    this.mindMap.keyCommand.addShortcut('Control+c', () => {
      this.copy()
    })
    // 剪切节点
    this.mindMap.keyCommand.addShortcut('Control+x', () => {
      this.cut()
    })
    // 粘贴节点
    this.mindMap.keyCommand.addShortcut('Control+v', () => {
      this.paste()
    })
    // 根节点居中显示
    this.mindMap.keyCommand.addShortcut('Control+Enter', () => {
      this.setRootNodeCenter()
    })
  }

  // 派发节点激活事件
  emitNodeActiveEvent(node = null, activeNodeList = [...this.activeNodeList]) {
    const isChange = !checkNodeListIsEqual(
      this.lastActiveNodeList,
      activeNodeList
    )
    if (!isChange) return
    this.lastActiveNodeList = [...activeNodeList]
    clearTimeout(this.emitNodeActiveEventTimer)
    this.emitNodeActiveEventTimer = setTimeout(() => {
      this.mindMap.emit('node_active', node, activeNodeList)
    }, 0)
  }

  // 鼠标点击画布时清空当前激活节点列表
  clearActiveNodeListOnDrawClick(e, eventType) {
    if (this.activeNodeList.length <= 0) return
    // 清除激活状态
    let isTrueClick = true
    // 是否是左键多选节点，右键拖动画布
    const { useLeftKeySelectionRightKeyDrag } = this.mindMap.opt
    // 如果鼠标按下和松开的距离较大，则不认为是点击事件
    if (
      eventType === 'contextmenu'
        ? !useLeftKeySelectionRightKeyDrag
        : useLeftKeySelectionRightKeyDrag
    ) {
      const mousedownPos = this.mindMap.event.mousedownPos
      isTrueClick =
        Math.abs(e.clientX - mousedownPos.x) <= 5 &&
        Math.abs(e.clientY - mousedownPos.y) <= 5
    }
    if (isTrueClick) {
      this.mindMap.execCommand('CLEAR_ACTIVE_NODE')
    }
  }

  //  开启文字编辑，会禁用回车键和删除键相关快捷键防止冲突
  startTextEdit() {
    this.mindMap.keyCommand.save()
  }

  //  结束文字编辑，会恢复回车键和删除键相关快捷键
  endTextEdit() {
    this.mindMap.keyCommand.restore()
  }

  // 清空节点缓存池
  clearCache() {
    this.layout.lru.clear()
    this.nodeCache = {}
    this.lastNodeCache = {}
  }

  // 登记一次渲染请求，渲染pass开始时原子取走
  // 渲染期间到达的请求合并进下一个pass，full一旦为true不降级
  requestRender({ callback, source, full = false } = {}) {
    if (!this.pendingRenderRequest) {
      this.pendingRenderRequest = { full: false, sources: [], callbacks: [] }
    }
    const request = this.pendingRenderRequest
    if (full) {
      request.full = true
    }
    if (callback && !request.callbacks.includes(callback)) {
      request.callbacks.push(callback)
    }
    if (source && !request.sources.includes(source)) {
      request.sources.push(source)
    }
  }

  // 判断是否包含某种触发渲染源
  checkHasRenderSource(val) {
    val = Array.isArray(val) ? val : [val]
    for (let i = 0; i < this.renderSourceList.length; i++) {
      if (val.includes(this.renderSourceList[i])) {
        return true
      }
    }
    return false
  }

  // 在随后完成的渲染管线结束时恢复视口
  scheduleViewRestore(viewData) {
    if (viewData) {
      this.pendingViewRestore = viewData
    }
  }

  // 渲染pass完毕：复位pass状态并兑现本pass的回调
  // 渲染期间到达了新请求则链式启动下一个pass
  // 对外的渲染结束事件只在请求队列静止时发出
  onRenderEnd() {
    const callbacks = this.renderCallbackList
    this.renderCallbackList = []
    this.renderSourceList = []
    this.isRendering = false
    this.reRender = false
    callbacks.forEach(fn => {
      fn()
    })
    if (this.pendingRenderRequest) {
      this._render()
      return
    }
    if (this.pendingViewRestore) {
      const preservedView = this.pendingViewRestore
      this.pendingViewRestore = null
      this.mindMap.view.setTransformData(preservedView, { silent: true })
    }
    this.flushPendingInsertEdits()
    this.mindMap.emit('node_tree_render_end')
  }

  // 放弃当前渲染pass：回调与来源并回待处理请求，由取代它的渲染统一兑现
  abortRenderPass() {
    const callbacks = this.renderCallbackList
    const sources = this.renderSourceList
    this.renderCallbackList = []
    this.renderSourceList = []
    this.isRendering = false
    this.reRender = false
    callbacks.forEach(callback => {
      this.requestRender({ callback })
    })
    sources.forEach(source => {
      this.requestRender({ source })
    })
    this._render()
  }

  // 渲染
  render(callback, source) {
    this.requestRender({ callback, source })
    const commandContext =
      this.mindMap.command && this.mindMap.command.getContext
        ? this.mindMap.command.getContext()
        : null
    clearTimeout(this.renderTimer)
    this.renderTimer = setTimeout(() => {
      if (
        commandContext &&
        this.mindMap.command &&
        this.mindMap.command.runWithContext
      ) {
        this.mindMap.command.runWithContext(commandContext, () => {
          this._render()
        })
        return
      }
      this._render()
    }, 0)
  }

  // 真正的渲染：原子取走待处理请求作为本次渲染pass的上下文
  _render() {
    // 渲染中到达的请求保留在pendingRenderRequest，当前pass结束后链式调度
    if (this.isRendering) {
      return
    }
    const request = this.pendingRenderRequest
    this.pendingRenderRequest = null
    // 请求已被更早的pass链式消费
    if (!request) {
      return
    }
    this.isRendering = true
    this.reRender = request.full
    this.renderCallbackList = request.callbacks
    this.renderSourceList = request.sources
    // 切换主题时，被收起的节点需要添加样式复位的标注
    if (this.checkHasRenderSource(CONSTANTS.CHANGE_THEME)) {
      this.resetUnExpandNodeStyle()
    }
    // 全量重建的清场在pass开始时执行
    // 避免画布清空后又被一个进行中的渲染重新挂载（整树重复渲染的根因）
    if (this.reRender) {
      this.clearCache()
      this.mindMap.clearDraw()
      this.clearActiveNodeList()
    }
    // 节点缓存
    this.lastNodeCache = this.nodeCache
    this.nodeCache = {}
    // 如果没有节点数据
    if (!this.renderTree) {
      this.onRenderEnd()
      return
    }
    this.mindMap.emit('node_tree_render_start')
    // 计算布局
    this.root = null
    this.layout.doLayout(root => {
      // 布局期间到达了全量重建请求：本pass的产物注定被清场覆盖，放弃挂载
      if (this.pendingRenderRequest && this.pendingRenderRequest.full) {
        this.abortRenderPass()
        return
      }
      // 删除本次渲染时不再需要的节点
      Object.keys(this.lastNodeCache).forEach(uid => {
        if (!this.nodeCache[uid]) {
          const staleNode = this.lastNodeCache[uid]
          // 从激活节点列表里删除
          this.removeNodeFromActiveList(staleNode)
          this.emitNodeActiveEvent()
          // 调用节点的销毁方法
          staleNode.destroy()
        }
      })
      // 更新根节点
      this.root = root
      // 渲染节点
      this.root.render(() => {
        this.renderOrchestrator.recordFullRender()
        this.onRenderEnd()
      })
    })
    this.emitNodeActiveEvent()
  }

  // 当某个自定义节点内容改变后，可以调用该方法实时更新该节点大小和整体节点的定位
  renderByCustomNodeContentNode(node) {
    node.getSize()
    node.customNodeContentRealtimeLayout()
    this.mindMap.render()
  }

  // 给当前被收起来的节点数据添加更新标志
  resetUnExpandNodeStyle() {
    if (!this.renderTree) return
    walk(this.renderTree, null, node => {
      if (!node.data.expand) {
        walk(node, null, node2 => {
          // 主要是触发数据新旧对比，不一样则会重新创建节点
          node2.data['needUpdate'] = true
        })
        return true
      }
    })
  }

  //  清除当前所有激活节点，并会触发事件
  clearActiveNode() {
    if (this.activeNodeList.length <= 0) {
      return
    }
    this.clearActiveNodeList()
    this.emitNodeActiveEvent(null, [])
  }

  //  清除当前激活的节点列表
  clearActiveNodeList() {
    let blocked = false
    this.activeNodeList.forEach(item => {
      const executed = this.mindMap.execCommand('SET_NODE_ACTIVE', item, false)
      if (executed === false) {
        blocked = true
      }
    })
    if (blocked) {
      return
    }
    this.activeNodeList = []
  }

  // 添加节点到激活列表里
  addNodeToActiveList(node, notEmitBeforeNodeActiveEvent = false) {
    if (
      this.mindMap.opt.onlyOneEnableActiveNodeOnCooperate &&
      node.userList.length > 0
    )
      return
    const index = this.findActiveNodeIndex(node)
    if (index === -1) {
      if (!notEmitBeforeNodeActiveEvent) {
        this.mindMap.emit('before_node_active', node, this.activeNodeList)
      }
      const executed = this.mindMap.execCommand('SET_NODE_ACTIVE', node, true)
      if (executed === false) {
        return
      }
      this.activeNodeList.push(node)
    }
  }

  // 在激活列表里移除某个节点
  removeNodeFromActiveList(node) {
    let index = this.findActiveNodeIndex(node)
    if (index === -1) {
      return
    }
    const executed = this.mindMap.execCommand('SET_NODE_ACTIVE', node, false)
    if (executed === false) {
      return
    }
    this.activeNodeList.splice(index, 1)
  }

  // 手动激活多个节点，激活单个节点请直接调用节点实例的active()方法
  activeMultiNode(nodeList = []) {
    nodeList.forEach(node => {
      // 手动派发节点激活前事件
      this.mindMap.emit('before_node_active', node, this.activeNodeList)
      // 激活节点，并将该节点添加到激活节点列表里
      this.addNodeToActiveList(node, true)
      // 手动派发节点激活事件
      this.emitNodeActiveEvent(node)
    })
  }

  // 手动取消激活多个节点
  cancelActiveMultiNode(nodeList = []) {
    nodeList.forEach(node => {
      this.removeNodeFromActiveList(node)
      this.emitNodeActiveEvent(null)
    })
  }

  //  检索某个节点在激活列表里的索引
  findActiveNodeIndex(node) {
    return getNodeIndexInNodeList(node, this.activeNodeList)
  }

  //  全选
  selectAll() {
    if (this.mindMap.opt.readonly) return
    walk(
      this.root,
      null,
      node => {
        if (!node.getData('isActive')) {
          this.addNodeToActiveList(node)
        }
        // 概要节点
        if (node._generalizationList && node._generalizationList.length > 0) {
          node._generalizationList.forEach(item => {
            const gNode = item.generalizationNode
            if (!gNode.getData('isActive')) {
              this.addNodeToActiveList(gNode)
            }
          })
        }
      },
      null,
      true,
      0,
      0
    )
    this.emitNodeActiveEvent()
  }

  //  回退
  back(step) {
    this.backForward('back', step)
  }

  //  前进
  forward(step) {
    this.backForward('forward', step)
  }

  // 前进回退
  backForward(type, step) {
    this.mindMap.execCommand('CLEAR_ACTIVE_NODE')
    const viewData = this.mindMap.view.getTransformData()
    const prevLayout = this.mindMap.getLayout()
    const data = this.mindMap.command[type](step)
    if (data) {
      const historySnapshot = simpleDeepClone(data)
      const themeConfig = historySnapshot.themeConfig
      const theme = historySnapshot.theme
      const layout = historySnapshot.layout
      const outerFramePaddingX = historySnapshot.outerFramePaddingX
      const outerFramePaddingY = historySnapshot.outerFramePaddingY
      const rainbowLinesConfig = historySnapshot.rainbowLinesConfig
      this.renderTree = getRenderTreeFromHistorySnapshot(historySnapshot)
      if (theme) {
        this.mindMap.opt.theme = theme
      }
      if (themeConfig) {
        this.mindMap.opt.themeConfig = themeConfig
        this.mindMap.initTheme()
      }
      const layoutChanged = layout && layout !== prevLayout
      if (layoutChanged) {
        this.mindMap.opt.layout = layout
        this.mindMap.view.reset()
        this.mindMap.renderer.setLayout()
      }
      if (outerFramePaddingX !== undefined) {
        this.mindMap.updateConfig({
          outerFramePaddingX,
          outerFramePaddingY
        })
      }
      if (rainbowLinesConfig) {
        this.mindMap.updateConfig({ rainbowLinesConfig })
        if (this.mindMap.rainbowLines) {
          this.mindMap.rainbowLines.updateRainLinesConfig(rainbowLinesConfig)
        }
      }
      if (!layoutChanged) {
        this.scheduleViewRestore(viewData)
      }
      this.mindMap.render()
      this.mindMap.emit('data_change', historySnapshot)
      this.mindMap.emit(
        'edit_history_restored',
        this.mindMap.command.activeHistoryIndex,
        this.mindMap.command.history.length
      )
    }
  }

  // 获取创建新节点的行为
  getNewNodeBehavior(openEdit = false, handleMultiNodes = false) {
    const { createNewNodeBehavior } = this.mindMap.opt
    let focusNewNode = false // 是否激活新节点
    let inserting = false // 新节点是否进入编辑模式
    switch (createNewNodeBehavior) {
      // 默认会激活新创建的节点，并且进入编辑模式。如果同时创建了多个新节点，那么只会激活而不会进入编辑模式
      case CONSTANTS.CREATE_NEW_NODE_BEHAVIOR.DEFAULT:
        focusNewNode = handleMultiNodes || !openEdit
        inserting = handleMultiNodes ? false : openEdit // 如果同时对多个节点插入子节点，那么无需进入编辑模式
        break
      // 不激活新创建的节点
      case CONSTANTS.CREATE_NEW_NODE_BEHAVIOR.NOT_ACTIVE:
        focusNewNode = false
        inserting = false
        break
      // 只激活新创建的节点，不进入编辑模式
      case CONSTANTS.CREATE_NEW_NODE_BEHAVIOR.ACTIVE_ONLY:
        focusNewNode = true
        inserting = false
        break
      default:
        break
    }
    return {
      focusNewNode,
      inserting
    }
  }

  //  插入同级节点
  insertNode(
    openEdit = true,
    appointNodes = [],
    appointData = null,
    appointChildren = []
  ) {
    appointNodes = formatDataToArray(appointNodes)
    if (this.activeNodeList.length <= 0 && appointNodes.length <= 0) {
      return
    }
    this.textEdit.hideEditTextBox()
    const {
      defaultInsertSecondLevelNodeText,
      defaultInsertBelowSecondLevelNodeText
    } = this.mindMap.opt
    const list = appointNodes.length > 0 ? appointNodes : this.activeNodeList
    const handleMultiNodes = list.length > 1
    const isRichText = this.hasRichTextPlugin()
    const { focusNewNode, inserting } = this.getNewNodeBehavior(
      openEdit,
      handleMultiNodes
    )
    const params = {
      expand: true,
      richText: isRichText,
      isActive: focusNewNode // 如果同时对多个节点插入子节点，那么需要把新增的节点设为激活状态。如果不进入编辑状态，那么也需要手动设为激活状态
    }
    if (isRichText) params.resetRichText = true
    // 动态指定的子节点数据也需要添加相关属性
    appointChildren = addDataToAppointNodes(appointChildren, params)
    const alreadyIsRichText = appointData && appointData.richText
    let createNewId = false
    list.forEach(node => {
      if (node.isGeneralization || node.isRoot) {
        return
      }
      appointChildren = simpleDeepClone(appointChildren)
      const parent = node.parent
      const isOneLayer = node.layerIndex === 1
      // 新插入节点的默认文本
      const text = isOneLayer
        ? defaultInsertSecondLevelNodeText
        : defaultInsertBelowSecondLevelNodeText
      // 计算插入位置
      const index = getNodeDataIndex(node)
      // 如果指定的数据就是富文本格式，那么不需要重新创建
      if (alreadyIsRichText && params.resetRichText) {
        delete params.resetRichText
      }
      const newNodeData = {
        inserting,
        data: {
          text: text,
          ...params,
          uid: createUid(),
          ...(appointData || {})
        },
        children: [...createUidForAppointNodes(appointChildren, createNewId)]
      }
      createNewId = true
      parent.nodeData.children.splice(index + 1, 0, newNodeData)
    })
    // 如果同时对多个节点插入子节点，需要清除原来激活的节点
    if (focusNewNode) {
      this.clearActiveNodeList()
    }
    this.mindMap.render()
  }

  // 插入多个同级节点
  insertMultiNode(appointNodes, nodeList) {
    if (!nodeList || nodeList.length <= 0) return
    appointNodes = formatDataToArray(appointNodes)
    if (this.activeNodeList.length <= 0 && appointNodes.length <= 0) {
      return
    }
    this.textEdit.hideEditTextBox()
    const list = appointNodes.length > 0 ? appointNodes : this.activeNodeList
    const isRichText = this.hasRichTextPlugin()
    const { focusNewNode } = this.getNewNodeBehavior(false, true)
    const params = {
      expand: true,
      richText: isRichText,
      isActive: focusNewNode
    }
    if (isRichText) params.resetRichText = true
    nodeList = addDataToAppointNodes(nodeList, params)
    let createNewId = false
    list.forEach(node => {
      if (node.isGeneralization || node.isRoot) {
        return
      }
      nodeList = simpleDeepClone(nodeList)
      const parent = node.parent
      // 计算插入位置
      const index = getNodeDataIndex(node)
      const newNodeList = createUidForAppointNodes(nodeList, createNewId)
      createNewId = true
      parent.nodeData.children.splice(index + 1, 0, ...newNodeList)
    })
    if (focusNewNode) {
      this.clearActiveNodeList()
    }
    this.mindMap.render()
  }

  //  插入子节点
  insertChildNode(
    openEdit = true,
    appointNodes = [],
    appointData = null,
    appointChildren = []
  ) {
    appointNodes = formatDataToArray(appointNodes)
    if (this.activeNodeList.length <= 0 && appointNodes.length <= 0) {
      return
    }
    this.textEdit.hideEditTextBox()
    const {
      defaultInsertSecondLevelNodeText,
      defaultInsertBelowSecondLevelNodeText
    } = this.mindMap.opt
    const list = appointNodes.length > 0 ? appointNodes : this.activeNodeList
    const handleMultiNodes = list.length > 1
    const isRichText = this.hasRichTextPlugin()
    const { focusNewNode, inserting } = this.getNewNodeBehavior(
      openEdit,
      handleMultiNodes
    )
    const params = {
      expand: true,
      richText: isRichText,
      isActive: focusNewNode
    }
    if (isRichText) params.resetRichText = true
    // 动态指定的子节点数据也需要添加相关属性
    appointChildren = addDataToAppointNodes(appointChildren, params)
    const alreadyIsRichText = appointData && appointData.richText
    let createNewId = false
    list.forEach(node => {
      if (node.isGeneralization) {
        return
      }
      appointChildren = simpleDeepClone(appointChildren)
      if (!node.nodeData.children) {
        node.nodeData.children = []
      }
      const text = node.isRoot
        ? defaultInsertSecondLevelNodeText
        : defaultInsertBelowSecondLevelNodeText
      // 如果指定的数据就是富文本格式，那么不需要重新创建
      if (alreadyIsRichText && params.resetRichText) {
        delete params.resetRichText
      }
      const newNode = {
        inserting,
        data: {
          text: text,
          uid: createUid(),
          ...params,
          ...(appointData || {})
        },
        children: [...createUidForAppointNodes(appointChildren, createNewId)]
      }
      createNewId = true
      node.nodeData.children.push(newNode)
      this.markTreeStructureDirty(node.uid, newNode.data.uid)
      // 插入子节点时自动展开子节点
      node.setData({
        expand: true
      })
    })
    // 如果同时对多个节点插入子节点，需要清除原来激活的节点
    if (focusNewNode) {
      this.clearActiveNodeList()
    }
    this.mindMap.render(null, 'insert-child')
  }

  // 插入多个子节点
  insertMultiChildNode(appointNodes, childList) {
    if (!childList || childList.length <= 0) return
    appointNodes = formatDataToArray(appointNodes)
    if (this.activeNodeList.length <= 0 && appointNodes.length <= 0) {
      return
    }
    this.textEdit.hideEditTextBox()
    const list = appointNodes.length > 0 ? appointNodes : this.activeNodeList
    const isRichText = this.hasRichTextPlugin()
    const { focusNewNode } = this.getNewNodeBehavior(false, true)
    const params = {
      expand: true,
      richText: isRichText,
      isActive: focusNewNode
    }
    if (isRichText) params.resetRichText = true
    childList = addDataToAppointNodes(childList, params)
    let createNewId = false
    list.forEach(node => {
      if (node.isGeneralization) {
        return
      }
      childList = simpleDeepClone(childList)
      if (!node.nodeData.children) {
        node.nodeData.children = []
      }
      childList = createUidForAppointNodes(childList, createNewId)
      // 第一个引用不需要重新创建uid，后面的需要重新创建，否则id会重复
      createNewId = true
      node.nodeData.children.push(...childList)
      // 插入子节点时自动展开子节点
      node.setData({
        expand: true
      })
    })
    if (focusNewNode) {
      this.clearActiveNodeList()
    }
    this.mindMap.render()
  }

  // 插入父节点
  insertParentNode(openEdit = true, appointNodes, appointData) {
    appointNodes = formatDataToArray(appointNodes)
    if (this.activeNodeList.length <= 0 && appointNodes.length <= 0) {
      return
    }
    this.textEdit.hideEditTextBox()
    const {
      defaultInsertSecondLevelNodeText,
      defaultInsertBelowSecondLevelNodeText
    } = this.mindMap.opt
    const list = appointNodes.length > 0 ? appointNodes : this.activeNodeList
    const handleMultiNodes = list.length > 1
    const isRichText = this.hasRichTextPlugin()
    const { focusNewNode, inserting } = this.getNewNodeBehavior(
      openEdit,
      handleMultiNodes
    )
    const params = {
      expand: true,
      richText: isRichText,
      isActive: focusNewNode
    }
    if (isRichText) params.resetRichText = true
    const alreadyIsRichText = appointData && appointData.richText
    list.forEach(node => {
      if (node.isGeneralization || node.isRoot) {
        return
      }
      const text =
        node.layerIndex === 1
          ? defaultInsertSecondLevelNodeText
          : defaultInsertBelowSecondLevelNodeText
      // 如果指定的数据就是富文本格式，那么不需要重新创建
      if (alreadyIsRichText && params.resetRichText) {
        delete params.resetRichText
      }
      const newNode = {
        inserting,
        data: {
          text: text,
          uid: createUid(),
          ...params,
          ...(appointData || {})
        },
        children: [node.nodeData]
      }
      const parent = node.parent
      // 获取当前节点所在位置
      const index = getNodeDataIndex(node)
      parent.nodeData.children.splice(index, 1, newNode)
    })
    // 如果同时对多个节点插入子节点，需要清除原来激活的节点
    if (focusNewNode) {
      this.clearActiveNodeList()
    }
    this.mindMap.render()
  }

  //  上移节点，多个节点只会操作第一个节点
  upNode(appointNode) {
    if (this.activeNodeList.length <= 0 && !appointNode) {
      return
    }
    const list = appointNode ? [appointNode] : this.activeNodeList
    const node = list[0]
    if (node.isRoot) {
      return
    }
    let parent = node.parent
    let childList = parent.children
    let index = getNodeIndexInNodeList(node, childList)
    if (index === -1 || index === 0) {
      return
    }
    let insertIndex = index - 1
    // 节点实例
    childList.splice(index, 1)
    childList.splice(insertIndex, 0, node)
    // 节点数据
    parent.nodeData.children.splice(index, 1)
    parent.nodeData.children.splice(insertIndex, 0, node.nodeData)
    this.mindMap.render()
  }

  //  下移节点，多个节点只会操作第一个节点
  downNode(appointNode) {
    if (this.activeNodeList.length <= 0 && !appointNode) {
      return
    }
    const list = appointNode ? [appointNode] : this.activeNodeList
    const node = list[0]
    if (node.isRoot) {
      return
    }
    let parent = node.parent
    let childList = parent.children
    let index = getNodeIndexInNodeList(node, childList)
    if (index === -1 || index === childList.length - 1) {
      return
    }
    let insertIndex = index + 1
    // 节点实例
    childList.splice(index, 1)
    childList.splice(insertIndex, 0, node)
    // 节点数据
    parent.nodeData.children.splice(index, 1)
    parent.nodeData.children.splice(insertIndex, 0, node.nodeData)
    this.mindMap.render()
  }

  // 将节点上移一个层级，多个节点只会操作第一个节点
  moveUpOneLevel(node) {
    node = node || this.activeNodeList[0]
    if (!node || node.isRoot || node.layerIndex <= 1) {
      return
    }
    const parent = node.parent
    const grandpa = parent.parent
    const index = getNodeIndexInNodeList(node, parent.children)
    const parentIndex = getNodeIndexInNodeList(parent, grandpa.children)
    // 节点数据
    parent.nodeData.children.splice(index, 1)
    grandpa.nodeData.children.splice(parentIndex + 1, 0, node.nodeData)
    this.mindMap.render()
  }

  // 移除节点数据的自定义样式的内部方法
  _handleRemoveCustomStyles(nodeData) {
    let hasCustomStyles = false
    Object.keys(nodeData).forEach(key => {
      if (checkIsNodeStyleDataKey(key)) {
        hasCustomStyles = true
        delete nodeData[key]
      }
    })
    // 如果是富文本，那么直接全部重新创建，因为有些样式是通过标签来渲染的
    if (this.hasRichTextPlugin()) {
      hasCustomStyles = true
      nodeData.resetRichText = true
    }
    return hasCustomStyles
  }

  // 一键去除自定义样式
  removeCustomStyles(node) {
    node = node || this.activeNodeList[0]
    if (!node) {
      return
    }
    const hasCustomStyles = this._handleRemoveCustomStyles(node.getData())
    if (hasCustomStyles) {
      this.reRenderNodeCheckChange(node)
    }
  }

  // 一键去除所有节点自定义样式
  removeAllNodeCustomStyles(appointNodes) {
    appointNodes = formatDataToArray(appointNodes)
    let hasCustomStyles = false
    // 指定了节点列表，那么遍历该节点列表
    if (appointNodes.length > 0) {
      appointNodes.forEach(node => {
        const _hasCustomStyles = this._handleRemoveCustomStyles(node.getData())
        if (_hasCustomStyles) hasCustomStyles = true
      })
    } else {
      // 否则遍历整棵树
      if (!this.renderTree) return
      walk(this.renderTree, null, node => {
        const _hasCustomStyles = this._handleRemoveCustomStyles(node.data)
        if (_hasCustomStyles) hasCustomStyles = true
        // 不要忘记概要节点
        const generalizationList = formatGetNodeGeneralization(node.data)
        if (generalizationList.length > 0) {
          generalizationList.forEach(generalizationData => {
            const _hasCustomStyles =
              this._handleRemoveCustomStyles(generalizationData)
            if (_hasCustomStyles) hasCustomStyles = true
          })
        }
      })
    }
    if (hasCustomStyles) {
      this.mindMap.reRender()
    }
  }

  // 复制节点
  copy() {
    this.beingCopyData = this.copyNode()
    if (!this.beingCopyData) return
    if (!this.mindMap.opt.disabledClipboard) {
      setDataToClipboard(createSmmFormatData(this.beingCopyData))
    }
  }

  // 剪切节点
  cut() {
    this.mindMap.execCommand('CUT_NODE', copyData => {
      this.beingCopyData = copyData
      if (!this.mindMap.opt.disabledClipboard) {
        setDataToClipboard(createSmmFormatData(copyData))
      }
    })
  }

  // 非https下复制黏贴，获取内容方法
  handlePaste(event) {
    const { disabledClipboard } = this.mindMap.opt
    if (disabledClipboard) return
    const clipboardData =
      event.clipboardData || event.originalEvent.clipboardData
    const items = clipboardData.items
    let img = null
    let text = ''
    Array.from(items).forEach(item => {
      if (item.type.indexOf('image') > -1) {
        img = item.getAsFile()
      }
      if (item.type.indexOf('text') > -1) {
        text = clipboardData.getData('text')
      }
    })
    this.paste()
  }

  // 粘贴
  async paste() {
    // 富文本编辑中由 RichText 插件自行处理粘贴，此处跳过
    if (this.mindMap.richText && this.mindMap.richText.showTextEdit) {
      return
    }
    const {
      errorHandler,
      handleIsSplitByWrapOnPasteCreateNewNode,
      handleNodePasteImg,
      disabledClipboard,
      onlyPasteTextWhenHasImgAndText
    } = this.mindMap.opt
    // 如果支持剪贴板操作，那么以剪贴板数据为准
    if (!disabledClipboard && checkClipboardReadEnable()) {
      try {
        const res = await getDataFromClipboard()
        let text = res.text || ''
        let img = res.img || null
        // 存在文本，则创建子节点
        if (text) {
          // 判断粘贴的是否是simple-mind-map的数据
          let smmData = null
          let useDefault = true
          // 用户自定义处理
          if (this.mindMap.opt.customHandleClipboardText) {
            try {
              const res = await this.mindMap.opt.customHandleClipboardText(text)
              if (!isUndef(res)) {
                useDefault = false
                const checkRes = checkSmmFormatData(res)
                if (checkRes.isSmm) {
                  smmData = checkRes.data
                } else {
                  text = checkRes.data
                }
              }
            } catch (error) {
              errorHandler(
                ERROR_TYPES.CUSTOM_HANDLE_CLIPBOARD_TEXT_ERROR,
                error
              )
            }
          }
          // 默认处理
          if (useDefault) {
            const checkRes = checkSmmFormatData(text)
            if (checkRes.isSmm) {
              smmData = checkRes.data
            } else {
              text = checkRes.data
            }
          }
          if (smmData) {
            this.mindMap.execCommand(
              'INSERT_MULTI_CHILD_NODE',
              [],
              Array.isArray(smmData) ? smmData : [smmData]
            )
          } else {
            // 如果是富文本模式，那么需要转义特殊字符
            if (this.hasRichTextPlugin()) {
              text = htmlEscape(text)
            }
            const textArr = text
              .split(new RegExp('\r?\n|(?<!\n)\r', 'g'))
              .filter(item => {
                return !!item
              })
            // 判断是否需要根据换行自动分割节点
            if (textArr.length > 1 && handleIsSplitByWrapOnPasteCreateNewNode) {
              handleIsSplitByWrapOnPasteCreateNewNode()
                .then(() => {
                  this.mindMap.execCommand(
                    'INSERT_MULTI_CHILD_NODE',
                    [],
                    textArr.map(item => {
                      return {
                        data: {
                          text: item
                        },
                        children: []
                      }
                    })
                  )
                })
                .catch(() => {
                  this.mindMap.execCommand('INSERT_CHILD_NODE', false, [], {
                    text
                  })
                })
            } else {
              this.mindMap.execCommand('INSERT_CHILD_NODE', false, [], {
                text
              })
            }
          }
        }
        // 存在图片，则添加到当前激活节点
        if (img && (!text || !onlyPasteTextWhenHasImgAndText)) {
          try {
            let imgData = null
            // 自定义图片处理函数
            if (
              handleNodePasteImg &&
              typeof handleNodePasteImg === 'function'
            ) {
              imgData = await handleNodePasteImg(img)
            } else {
              imgData = await loadImage(img, {
                maxWidth: this.mindMap.opt.maxNodeImageStorageWidth,
                maxHeight: this.mindMap.opt.maxNodeImageStorageHeight,
                maxBytes: this.mindMap.opt.maxNodeImageStorageBytes
              })
            }
            if (this.activeNodeList.length > 0) {
              this.activeNodeList.forEach(node => {
                const imageSize = fitPastedImageSizeToNodeText(
                  node,
                  imgData.size
                )
                this.mindMap.execCommand('SET_NODE_IMAGE', node, {
                  url: imgData.url,
                  title: '',
                  width: imageSize.width,
                  height: imageSize.height,
                  custom: imageSize.custom === true
                })
              })
            }
          } catch (error) {
            errorHandler(ERROR_TYPES.LOAD_CLIPBOARD_IMAGE_ERROR, error)
          }
        }
      } catch (error) {
        errorHandler(ERROR_TYPES.READ_CLIPBOARD_ERROR, error)
      }
    } else {
      // 禁用剪贴板或不支持剪贴板时
      // 粘贴画布内的节点数据
      if (this.beingCopyData) {
        this.mindMap.execCommand('PASTE_NODE', this.beingCopyData)
      }
    }
  }

  //  将节点移动到另一个节点的前面
  insertBefore(node, exist) {
    this.insertTo(node, exist, 'before')
  }

  //  将节点移动到另一个节点的后面
  insertAfter(node, exist) {
    this.insertTo(node, exist, 'after')
  }

  // 将节点移动到另一个节点的前面或后面
  insertTo(node, exist, dir = 'before') {
    let nodeList = formatDataToArray(node)
    nodeList = nodeList.filter(item => {
      return !item.isRoot
    })
    if (dir === 'after') {
      nodeList.reverse()
    }
    nodeList.forEach(item => {
      // 移动节点
      let nodeParent = item.parent
      let nodeBorthers = nodeParent.children
      let nodeIndex = getNodeIndexInNodeList(item, nodeBorthers)
      if (nodeIndex === -1) {
        return
      }
      nodeBorthers.splice(nodeIndex, 1)
      nodeParent.nodeData.children.splice(nodeIndex, 1)

      // 目标节点
      let existParent = exist.parent
      let existBorthers = existParent.children
      let existIndex = getNodeIndexInNodeList(exist, existBorthers)
      if (existIndex === -1) {
        return
      }
      if (dir === 'after') {
        existIndex++
      }
      existBorthers.splice(existIndex, 0, item)
      existParent.nodeData.children.splice(existIndex, 0, item.nodeData)
    })
    this.markNodeMoveDirty(nodeList, exist.parent)
    this.mindMap.render(null, 'node-insert-sibling')
  }

  //  移除节点
  removeNode(appointNodes = []) {
    appointNodes = formatDataToArray(appointNodes)
    if (this.activeNodeList.length <= 0 && appointNodes.length <= 0) {
      return
    }
    // 删除节点后需要激活的节点
    let needActiveNode = null
    let isAppointNodes = appointNodes.length > 0
    let list = isAppointNodes ? appointNodes : this.activeNodeList
    let root = list.find(node => {
      return node.isRoot
    })
    if (root) {
      this.clearActiveNodeList()
      root.children = []
      root.nodeData.children = []
    } else {
      // 如果只选中了一个节点，删除后激活其兄弟节点或者父节点
      needActiveNode = this.getNextActiveNode(list)
      for (let i = 0; i < list.length; i++) {
        const node = list[i]
        const currentEditNode = this.textEdit.getCurrentEditNode()
        if (
          currentEditNode &&
          currentEditNode.getData('uid') === node.getData('uid')
        ) {
          // 如果当前节点正在编辑中，那么先完成编辑
          this.textEdit.hideEditTextBox()
        }
        if (isAppointNodes) list.splice(i, 1)
        if (node.isGeneralization) {
          this.deleteNodeGeneralization(node)
          this.removeNodeFromActiveList(node)
          i--
        } else {
          this.removeNodeFromActiveList(node)
          removeFromParentNodeData(node)
          i--
        }
      }
    }
    this.activeNodeList = []
    // 激活被删除节点的兄弟节点或父节点
    if (needActiveNode) {
      this.addNodeToActiveList(needActiveNode)
    }
    this.emitNodeActiveEvent()
    this.mindMap.render()
  }

  // 删除概要节点，即从所属节点里删除该概要
  deleteNodeGeneralization(node) {
    const targetNode = node.generalizationBelongNode
    const index = targetNode.getGeneralizationNodeIndex(node)
    let generalization = targetNode.getData('generalization')
    if (Array.isArray(generalization)) {
      generalization.splice(index, 1)
    } else {
      generalization = null
    }
    // 删除概要节点
    this.mindMap.execCommand('SET_NODE_DATA', targetNode, {
      generalization
    })
    this.closeHighlightNode()
  }

  // 仅删除当前节点
  removeCurrentNode(appointNodes = []) {
    appointNodes = formatDataToArray(appointNodes)
    if (this.activeNodeList.length <= 0 && appointNodes.length <= 0) {
      return
    }
    let isAppointNodes = appointNodes.length > 0
    let list = isAppointNodes ? appointNodes : this.activeNodeList
    list = list.filter(node => {
      return !node.isRoot
    })
    // 删除节点后需要激活的节点，如果只选中了一个节点，删除后激活其兄弟节点或者父节点
    let needActiveNode = this.getNextActiveNode(list)
    for (let i = 0; i < list.length; i++) {
      let node = list[i]
      if (node.isGeneralization) {
        // 删除概要节点
        this.deleteNodeGeneralization(node)
      } else {
        const parent = node.parent
        const index = getNodeDataIndex(node)
        parent.nodeData.children.splice(
          index,
          1,
          ...(node.nodeData.children || [])
        )
      }
    }
    this.activeNodeList = []
    // 激活被删除节点的兄弟节点或父节点
    if (needActiveNode) {
      this.addNodeToActiveList(needActiveNode)
    }
    this.emitNodeActiveEvent()
    this.mindMap.render()
  }

  // 计算下一个可激活的节点
  getNextActiveNode(deleteList) {
    // 删除多个节点不自动激活相邻节点
    if (deleteList.length !== 1) return null
    // 被删除的节点不在当前激活的节点列表里，不激活相邻节点
    if (this.findActiveNodeIndex(deleteList[0]) === -1) return null
    let needActiveNode = null
    if (
      this.activeNodeList.length === 1 &&
      !this.activeNodeList[0].isGeneralization &&
      this.mindMap.opt.deleteNodeActive
    ) {
      const node = this.activeNodeList[0]
      const broList = node.parent.children
      const nodeIndex = getNodeIndexInNodeList(node, broList)
      // 如果后面有兄弟节点
      if (nodeIndex < broList.length - 1) {
        needActiveNode = broList[nodeIndex + 1]
      } else {
        // 如果前面有兄弟节点
        if (nodeIndex > 0) {
          needActiveNode = broList[nodeIndex - 1]
        } else {
          // 没有兄弟节点
          needActiveNode = node.parent
        }
      }
    }
    return needActiveNode
  }

  //  复制节点
  copyNode() {
    if (this.activeNodeList.length <= 0) {
      return null
    }
    let nodeList = getTopAncestorsFomNodeList(this.activeNodeList)
    nodeList = sortNodeList(nodeList)
    return nodeList.map(node => {
      return copyNodeTree({}, node, true)
    })
  }

  //  剪切节点
  cutNode(callback) {
    if (this.activeNodeList.length <= 0) {
      return
    }
    // 找出激活节点中的顶层节点列表，并过滤掉根节点
    let nodeList = getTopAncestorsFomNodeList(this.activeNodeList).filter(
      node => {
        return !node.isRoot
      }
    )
    nodeList = sortNodeList(nodeList)
    // 复制数据
    const copyData = nodeList.map(node => {
      return copyNodeTree({}, node, true)
    })
    // 从父节点的数据中移除
    nodeList.forEach(node => {
      removeFromParentNodeData(node)
    })
    // 清空激活节点列表
    this.clearActiveNodeList()
    this.mindMap.render()
    if (callback && typeof callback === 'function') {
      callback(copyData)
    }
  }

  //  移动节点作为另一个节点的子节点
  moveNodeTo(node, toNode) {
    let nodeList = formatDataToArray(node)
    nodeList = nodeList.filter(item => {
      return !item.isRoot
    })
    nodeList.forEach(item => {
      this.removeNodeFromActiveList(item)
      removeFromParentNodeData(item)
      toNode.setData({
        expand: true
      })
      toNode.nodeData.children.push(item.nodeData)
    })
    this.markNodeMoveDirty(nodeList, toNode)
    this.emitNodeActiveEvent()
    this.mindMap.render(null, 'node-move-to')
  }

  // 按 DropTarget 统一移动节点，拖拽决策层只传 parent + insertionIndex
  moveNodeByDropTarget(node, targetParent, insertionIndex, dir) {
    let nodeList = formatDataToArray(node)
    nodeList = sortNodeList(
      nodeList.filter(item => {
        return !item.isRoot
      })
    )
    if (!nodeList.length || !targetParent) {
      return
    }
    let adjustedInsertionIndex = insertionIndex
    nodeList.forEach(item => {
      if (item.parent !== targetParent) {
        return
      }
      const index = getNodeDataIndex(item)
      if (index !== -1 && index < insertionIndex) {
        adjustedInsertionIndex--
      }
    })
    const movingDataList = nodeList.map(item => item.nodeData)
    nodeList.forEach(item => {
      this.removeNodeFromActiveList(item)
      removeFromParentNodeData(item)
    })
    adjustedInsertionIndex = Math.max(
      0,
      Math.min(adjustedInsertionIndex, targetParent.nodeData.children.length)
    )
    movingDataList.forEach((nodeData, index) => {
      if (
        dir &&
        (this.mindMap.opt.layout === CONSTANTS.LAYOUT.MIND_MAP ||
          Object.prototype.hasOwnProperty.call(nodeData.data, 'dir'))
      ) {
        nodeData.data.dir = dir
      }
      targetParent.nodeData.children.splice(
        adjustedInsertionIndex + index,
        0,
        nodeData
      )
    })
    targetParent.setData({
      expand: true
    })
    this.markNodeMoveDirty(nodeList, targetParent)
    this.emitNodeActiveEvent()
    this.mindMap.render(null, 'node-move-drop')
  }

  //   粘贴节点到节点
  pasteNode(data) {
    data = formatDataToArray(data)
    this.mindMap.execCommand('INSERT_MULTI_CHILD_NODE', [], data)
  }

  //  设置节点样式
  setNodeStyle(node, prop, value) {
    const data = {
      [prop]: value
    }
    this.setNodeDataRender(node, data)
    // 更新了连线的样式
    if (lineStyleProps.includes(prop)) {
      (node.parent || node).renderLine(true)
    }
  }

  //  设置节点多个样式
  setNodeStyles(node, style) {
    const data = { ...style }
    this.setNodeDataRender(node, data)
    // 更新了连线的样式
    let props = Object.keys(style)
    let hasLineStyleProps = false
    props.forEach(key => {
      if (lineStyleProps.includes(key)) {
        hasLineStyleProps = true
      }
    })
    if (hasLineStyleProps) {
      (node.parent || node).renderLine(true)
    }
  }

  //  设置节点是否激活
  setNodeActive(node, active) {
    this.mindMap.execCommand('SET_NODE_DATA', node, {
      isActive: active
    })
    node.updateNodeByActive(active)
  }

  //  设置节点是否展开
  setNodeExpand(node, expand) {
    this.mindMap.execCommand('SET_NODE_DATA', node, {
      expand
    })
    this.mindMap.render()
  }

  //  展开所有
  expandAllNode(uid = '') {
    if (!this.renderTree) return

    const _walk = (node, enableExpand) => {
      // 如果该节点为目标节点，那么修改允许展开的标志
      if (!enableExpand && node.data.uid === uid) {
        enableExpand = true
      }
      if (enableExpand && !node.data.expand) {
        node.data.expand = true
      }
      if (node.children && node.children.length > 0) {
        node.children.forEach(child => {
          _walk(child, enableExpand)
        })
      }
    }
    _walk(this.renderTree, !uid)

    this.mindMap.render()
  }

  //  收起所有
  unexpandAllNode(isSetRootNodeCenter = true, uid = '') {
    if (!this.renderTree) return

    const _walk = (node, isRoot, enableUnExpand) => {
      // 如果该节点为目标节点，那么修改允许展开的标志
      if (!enableUnExpand && node.data.uid === uid) {
        enableUnExpand = true
      }
      if (
        enableUnExpand &&
        !isRoot &&
        node.children &&
        node.children.length > 0
      ) {
        node.data.expand = false
      }
      if (node.children && node.children.length > 0) {
        node.children.forEach(child => {
          _walk(child, false, enableUnExpand)
        })
      }
    }
    _walk(this.renderTree, true, !uid)

    this.mindMap.render(() => {
      if (isSetRootNodeCenter) {
        this.setRootNodeCenter()
      }
    })
  }

  //  展开到指定层级
  expandToLevel(level) {
    if (!this.renderTree) return
    walk(
      this.renderTree,
      null,
      (node, parent, isRoot, layerIndex) => {
        const expand = layerIndex < level
        if (expand) {
          node.data.expand = true
        } else if (!isRoot && node.children && node.children.length > 0) {
          node.data.expand = false
        }
      },
      null,
      true,
      0,
      0
    )
    this.mindMap.render()
  }

  //  切换激活节点的展开状态
  toggleActiveExpand() {
    this.activeNodeList.forEach(node => {
      if (node.nodeData.children.length <= 0 || node.isRoot) {
        return
      }
      this.toggleNodeExpand(node)
    })
  }

  //  切换节点展开状态
  toggleNodeExpand(node) {
    this.mindMap.execCommand('SET_NODE_EXPAND', node, !node.getData('expand'))
  }

  //  设置节点文本
  setNodeText(node, text, richText, resetRichText) {
    richText = richText === undefined ? node.getData('richText') : richText
    this.setNodeDataRender(node, {
      text,
      richText,
      resetRichText
    })
  }

  //  设置节点图片
  setNodeImage(node, data) {
    const {
      url,
      title,
      width,
      height,
      custom = false
    } = data || { url: '', title: '', width: 0, height: 0, custom: false }
    this.setNodeDataRender(node, {
      image: url,
      imageTitle: title || '',
      imageSize: {
        width,
        height,
        custom
      }
    })
  }

  //  设置节点图标
  setNodeIcon(node, icons) {
    this.setNodeDataRender(node, {
      icon: icons
    })
  }

  //  设置节点超链接
  setNodeHyperlink(node, link, title = '') {
    this.setNodeDataRender(node, {
      hyperlink: link,
      hyperlinkTitle: title
    })
  }

  //  设置节点备注
  setNodeNote(node, note) {
    this.setNodeDataRender(node, {
      note
    })
  }

  //  设置节点附件
  setNodeAttachment(node, url, name = '') {
    this.setNodeDataRender(node, {
      attachmentUrl: url,
      attachmentName: name
    })
  }

  //  设置节点标签
  setNodeTag(node, tag) {
    this.setNodeDataRender(node, {
      tag
    })
  }

  // 设置节点公式
  insertFormula(formula, appointNodes = []) {
    // 只在富文本模式下可用，并且需要注册Formula插件
    if (!this.hasRichTextPlugin() || !this.mindMap.formula) return
    appointNodes = formatDataToArray(appointNodes)
    const list = appointNodes.length > 0 ? appointNodes : this.activeNodeList
    list.forEach(node => {
      this.mindMap.formula.insertFormulaToNode(node, formula)
    })
  }

  //  添加节点概要
  addGeneralization(data, openEdit = true) {
    if (this.activeNodeList.length <= 0) {
      return
    }
    const nodeList = this.activeNodeList.filter(node => {
      return (
        !node.isRoot &&
        !node.isGeneralization &&
        !node.checkHasSelfGeneralization()
      )
    })
    const list = parseAddGeneralizationNodeList(nodeList)
    if (list.length <= 0) return
    const isRichText = this.hasRichTextPlugin()
    const { focusNewNode, inserting } = this.getNewNodeBehavior(
      openEdit,
      list.length > 1
    )
    let needRender = false
    const alreadyIsRichText = data && data.richText
    list.forEach(item => {
      const newData = {
        inserting,
        ...(data || {
          text: this.mindMap.opt.defaultGeneralizationText
        }),
        range: item.range || null,
        uid: createUid(),
        richText: isRichText,
        isActive: focusNewNode
      }
      if (isRichText && !alreadyIsRichText) newData.resetRichText = isRichText
      let generalization = item.node.getData('generalization')
      generalization = generalization
        ? Array.isArray(generalization)
          ? generalization
          : [generalization]
        : []
      // 如果是范围概要，那么检查该范围是否存在
      if (item.range) {
        const isExist = !!generalization.find(item2 => {
          return (
            item2.range &&
            item2.range[0] === item.range[0] &&
            item2.range[1] === item.range[1]
          )
        })
        if (isExist) {
          return
        }
        // 不存在则添加
        generalization.push(newData)
      } else {
        // 不是范围概要直接添加，因为前面已经判断过是否存在
        generalization.push(newData)
      }
      needRender = true
      this.mindMap.execCommand('SET_NODE_DATA', item.node, {
        generalization
      })
      // 插入子节点时自动展开子节点
      item.node.setData({
        expand: true
      })
    })
    if (!needRender) return
    // 需要清除原来激活的节点
    if (focusNewNode) {
      this.clearActiveNodeList()
    }
    this.mindMap.render(() => {
      // 修复祖先节点存在概要时位置未更新的问题
      // 修复同时给存在上下级关系的节点添加概要时重叠的问题
      this.mindMap.render()
    })
  }

  //  删除节点概要
  removeGeneralization() {
    if (this.activeNodeList.length <= 0) {
      return
    }
    this.activeNodeList.forEach(node => {
      if (!node.checkHasGeneralization()) {
        return
      }
      this.mindMap.execCommand('SET_NODE_DATA', node, {
        generalization: null
      })
    })
    this.mindMap.render()
    this.closeHighlightNode()
  }

  //  设置节点自定义位置
  setNodeCustomPosition(node, left = undefined, top = undefined) {
    let nodeList = [node] || this.activeNodeList
    nodeList.forEach(item => {
      this.mindMap.execCommand('SET_NODE_DATA', item, {
        customLeft: left,
        customTop: top
      })
    })
  }

  //  一键整理布局，即去除自定义位置
  resetLayout() {
    walk(
      this.root,
      null,
      node => {
        node.customLeft = undefined
        node.customTop = undefined
        this.mindMap.execCommand('SET_NODE_DATA', node, {
          customLeft: undefined,
          customTop: undefined
        })
        this.mindMap.render()
      },
      null,
      true,
      0,
      0
    )
  }

  //  设置节点形状
  setNodeShape(node, shape) {
    if (!shape || !shapeList.includes(shape)) {
      return
    }
    let nodeList = [node] || this.activeNodeList
    nodeList.forEach(item => {
      this.setNodeStyle(item, 'shape', shape)
    })
  }

  // 定位到指定节点
  goTargetNode(node, callback = () => {}) {
    let uid = typeof node === 'string' ? node : node.getData('uid')
    if (!uid) return
    this.expandToNodeUid(uid, () => {
      let targetNode = this.findNodeByUid(uid)
      if (targetNode) {
        targetNode.active()
        this.moveNodeToCenter(targetNode)
        callback(targetNode)
      }
    })
  }

  //  更新节点数据
  setNodeData(node, data) {
    Object.keys(data).forEach(key => {
      node.nodeData.data[key] = data[key]
    })
  }

  //  设置节点数据，并判断是否渲染
  setNodeDataRender(node, data, notRender = false) {
    if (data && (data.text !== undefined || data.richText !== undefined)) {
      this.invalidateTextContent(node.uid)
    }
    this.mindMap.execCommand('SET_NODE_DATA', node, data)
    if (isNodeNotNeedRenderData(data)) {
      this.mindMap.emit('node_tree_render_end')
      return
    }
    this.reRenderNodeCheckChange(node, notRender)
  }

  // 重新节点某个节点，判断节点大小是否发生了改变，是的话触发重绘
  reRenderNodeCheckChange(node, notRender) {
    let changed = node.reRender()
    if (changed) {
      if (!notRender) this.mindMap.render(null, 'set-node-data-render')
    } else {
      this.mindMap.emit('node_tree_render_end')
    }
  }

  // 移动节点到画布中心
  // resetScale参数指定是否要将画布缩放值复位为100%，当你没有显式传递时，默认值为undefined，因为实例化选项的resetScaleOnMoveNodeToCenter配置也会决定是否复位缩放，所以当你没有显式传递时使用resetScaleOnMoveNodeToCenter配置，否则使用resetScale配置
  moveNodeToCenter(node, resetScale) {
    let { resetScaleOnMoveNodeToCenter } = this.mindMap.opt
    if (resetScale !== undefined) {
      resetScaleOnMoveNodeToCenter = resetScale
    }
    let { transform, state } = this.mindMap.view.getTransformData()
    let { left, top, width, height } = node
    if (!resetScaleOnMoveNodeToCenter) {
      left *= transform.scaleX
      top *= transform.scaleY
      width *= transform.scaleX
      height *= transform.scaleY
    }
    let halfWidth = this.mindMap.width / 2
    let halfHeight = this.mindMap.height / 2
    let nodeCenterX = left + width / 2
    let nodeCenterY = top + height / 2
    let targetX = halfWidth - state.x
    let targetY = halfHeight - state.y
    let offsetX = targetX - nodeCenterX
    let offsetY = targetY - nodeCenterY
    this.mindMap.view.translateX(offsetX)
    this.mindMap.view.translateY(offsetY)
    if (resetScaleOnMoveNodeToCenter) {
      this.mindMap.view.setScale(1)
    }
  }

  // 回到中心主题，即设置根节点到画布中心
  setRootNodeCenter() {
    this.moveNodeToCenter(this.root)
  }

  // 展开到指定uid的节点
  expandToNodeUid(uid, callback = () => {}) {
    if (!this.renderTree) {
      callback()
      return
    }
    let parentsList = []
    let isGeneralization = false
    const cache = {}
    bfsWalk(this.renderTree, (node, parent) => {
      if (node.data.uid === uid) {
        parentsList = parent ? [...cache[parent.data.uid], parent] : []
        return 'stop'
      }
      const generalizationList = formatGetNodeGeneralization(node.data)
      generalizationList.forEach(item => {
        if (item.uid === uid) {
          parentsList = parent ? [...cache[parent.data.uid], parent, node] : []
          isGeneralization = true
        }
      })
      if (isGeneralization) {
        return 'stop'
      }
      cache[node.data.uid] = parent ? [...cache[parent.data.uid], parent] : []
    })
    let needRender = false
    parentsList.forEach(node => {
      if (!node.data.expand) {
        needRender = true
        node.data.expand = true
      }
    })
    // 如果是展开到概要节点，那么父节点下的所有节点都需要开
    if (isGeneralization) {
      const lastNode = parentsList[parentsList.length - 1]
      if (lastNode) {
        walk(lastNode, null, node => {
          if (!node.data.expand) {
            needRender = true
            node.data.expand = true
          }
        })
      }
    }
    if (needRender) {
      this.mindMap.render(callback)
    } else {
      callback()
    }
  }

  // 根据uid找到对应的节点实例
  findNodeByUid(uid) {
    if (!this.root) return
    let res = null
    walk(this.root, null, node => {
      if (node.getData('uid') === uid) {
        res = node
        return true
      }
      // 概要节点
      let isGeneralization = false
      ;(node._generalizationList || []).forEach(item => {
        if (item.generalizationNode.getData('uid') === uid) {
          res = item.generalizationNode
          isGeneralization = true
        }
      })
      if (isGeneralization) {
        return true
      }
    })
    return res
  }

  // 高亮节点或子节点
  highlightNode(node, range, style) {
    // 如果当前正在渲染，那么不进行高亮，因为节点位置可能不正确
    if (this.isRendering) return
    style = {
      stroke: 'rgb(94, 200, 248)',
      fill: 'transparent',
      ...(style || {})
    }
    // 尚未创建
    if (!this.highlightBoxNode) {
      this.highlightBoxNode = new Polygon()
        .stroke({
          color: style.stroke || 'transparent'
        })
        .fill({
          color: style.fill || 'transparent'
        })
    } else if (this.highlightBoxNodeStyle) {
      // 样式更新了
      if (
        this.highlightBoxNodeStyle.stroke !== style.stroke ||
        this.highlightBoxNodeStyle.fill !== style.fill
      ) {
        this.highlightBoxNode
          .stroke({
            color: style.stroke || 'transparent'
          })
          .fill({
            color: style.fill || 'transparent'
          })
      }
    }
    this.highlightBoxNodeStyle = { ...style }
    let minx = Infinity,
      miny = Infinity,
      maxx = -Infinity,
      maxy = -Infinity
    if (range) {
      const children = node.children.slice(range[0], range[1] + 1)
      children.forEach(child => {
        if (child.left < minx) {
          minx = child.left
        }
        if (child.top < miny) {
          miny = child.top
        }
        const right = child.left + child.width
        const bottom = child.top + child.height
        if (right > maxx) {
          maxx = right
        }
        if (bottom > maxy) {
          maxy = bottom
        }
      })
    } else {
      minx = node.left
      miny = node.top
      maxx = node.left + node.width
      maxy = node.top + node.height
    }
    this.highlightBoxNode.plot([
      [minx, miny],
      [maxx, miny],
      [maxx, maxy],
      [minx, maxy]
    ])
    this.mindMap.otherDraw.add(this.highlightBoxNode)
  }

  // 关闭高亮
  closeHighlightNode() {
    if (!this.highlightBoxNode) return
    this.highlightBoxNode.remove()
  }

  // 是否存在富文本插件
  hasRichTextPlugin() {
    return !!this.mindMap.richText
  }
}

export default Render
