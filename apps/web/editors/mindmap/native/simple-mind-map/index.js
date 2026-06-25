import View from './src/core/view/View'
import Event from './src/core/event/Event'
import Render from './src/core/render/Render'
import merge from 'deepmerge'
import theme from './src/theme'
import Style from './src/core/render/node/Style'
import KeyCommand from './src/core/command/KeyCommand'
import Command from './src/core/command/Command'
import BatchExecution from './src/utils/BatchExecution'
import {
  layoutValueList,
  CONSTANTS,
  ERROR_TYPES,
  cssContent,
  nodeDataNoStylePropList
} from './src/constants/constant'
import { SVG, G, Rect } from '@svgdotjs/svg.js'
import {
  simpleDeepClone,
  getObjectChangedProps,
  isSameObject,
  isUndef,
  handleGetSvgDataExtraContent,
  getNodeTreeBoundingRect,
  mergeTheme,
  createUidForAppointNodes,
  getRenderTreeFromHistorySnapshot
} from './src/utils'
import defaultTheme, {
  checkIsNodeSizeIndependenceConfig
} from './src/theme/default'
import { defaultOpt } from './src/constants/defaultOptions'

// deepmerge ?? DOM / ????????????????? el ?? getBoundingClientRect
const RUNTIME_MERGE_OMIT_KEYS = [
  'el',
  'data',
  'viewData',
  'view',
  'customInnerElsAppendTo',
  'customNoteContentShow'
]

function omitRuntimeMergeKeys(opt) {
  if (!opt || typeof opt !== 'object') {
    return {}
  }
  const next = { ...opt }
  RUNTIME_MERGE_OMIT_KEYS.forEach(key => {
    delete next[key]
  })
  return next
}

function pickRuntimeMergeKeys(opt) {
  const picked = {}
  if (!opt || typeof opt !== 'object') {
    return picked
  }
  RUNTIME_MERGE_OMIT_KEYS.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(opt, key)) {
      picked[key] = opt[key]
    }
  })
  return picked
}

function applyRuntimeMergeKeys(target, runtimeOpt) {
  RUNTIME_MERGE_OMIT_KEYS.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(runtimeOpt, key)) {
      target[key] = runtimeOpt[key]
    }
  })
}

function isMindMapContainerElement(el) {
  return (
    el &&
    typeof el.getBoundingClientRect === 'function' &&
    typeof el.appendChild === 'function'
  )
}

//  ????
class MindMap {
  //  ????
  /**
   *
   * @param {defaultOpt} opt
   */
  constructor(opt = {}) {
    MindMap.instanceCount++
    const runtimeOpt = pickRuntimeMergeKeys(opt)
    // ?????DOM / ????????????? deepmerge?
    this.opt = this.handleOpt(merge(defaultOpt, omitRuntimeMergeKeys(opt)))
    applyRuntimeMergeKeys(this.opt, runtimeOpt)
    // ???????
    this.opt.data = this.handleData(this.opt.data)

    // ????
    this.el = this.opt.el
    if (!isMindMapContainerElement(this.el)) {
      throw new Error('??????el')
    }

    // ??????????
    this.getElRectInfo()

    // ??????
    this.initWidth = this.width
    this.initHeight = this.height

    // ???css??
    this.cssEl = null
    this.cssTextMap = {} // ??????????????????????svg??????svg???

    // ????/??????
    /*
      {
        name: '',// ?????????
        // ?????????????????
        createContent: (node) => {
          return {
            node: null,
            width: 0,
            height: 0
          }
        },
        // ??????????opt??????
        createNodeData: () => {},
        // ???????opt????????????
        updateNodeData: () => {},
      }
    */
    this.nodeInnerPrefixList = []
    this.nodeInnerPostfixList = []

    // ?????????????????????????body????????????????
    // ???????customCheckEnableShortcut?????
    this.editNodeClassList = []

    // ?????????
    /*
      {
        createShape: (node) => {
          return path
        },
        getPadding: ({ node, width, height, paddingX, paddingY }) => {
          return {
            paddingX: 0,
            paddingY: 0
          }
        }
      }
    */
    this.extendShapeList = []

    // ??
    this.initContainer()

    // ?????
    this.initTheme()

    // ???????
    this.initCache()

    // ????
    MindMap.pluginList
      .filter(plugin => {
        return plugin.preload
      })
      .forEach(plugin => {
        this.initPlugin(plugin)
      })

    // ???
    this.event = new Event({
      mindMap: this
    })

    // ???
    this.keyCommand = new KeyCommand({
      mindMap: this
    })

    // ???
    this.command = new Command({
      mindMap: this
    })

    // ???
    this.renderer = new Render({
      mindMap: this
    })

    // ?????
    this.view = new View({
      mindMap: this
    })

    // ?????
    this.batchExecution = new BatchExecution()

    // ????
    MindMap.pluginList
      .filter(plugin => {
        return !plugin.preload
      })
      .forEach(plugin => {
        this.initPlugin(plugin)
      })

    // ?????css??
    this.addCss()

    // ????
    this.render(this.opt.fit ? () => this.view.fit() : () => {})

    // ???????????????
    if (this.opt.addHistoryOnInit && this.opt.data) {
      this.command.addHistory()
    }
  }

  //  ??????
  handleOpt(opt) {
    // ??????
    if (!layoutValueList.includes(opt.layout)) {
      opt.layout = CONSTANTS.LAYOUT.LOGICAL_STRUCTURE
    }
    // ??????
    opt.theme = opt.theme && theme[opt.theme] ? opt.theme : 'default'
    return opt
  }

  // ???????
  handleData(data) {
    if (isUndef(data) || Object.keys(data).length <= 0) return null
    data = simpleDeepClone(data || {})
    // ???????
    if (data.data && !data.data.expand) {
      data.data.expand = true
    }
    // ???uid?????uid
    createUidForAppointNodes([data], false, null, true)
    return data
  }

  // ??????
  initContainer() {
    const { associativeLineIsAlwaysAboveNode } = this.opt
    // ???????????
    this.el.classList.add('smm-mind-map-container')
    // ???????
    const createAssociativeLineDraw = () => {
      this.associativeLineDraw = this.draw.group()
      this.associativeLineDraw.addClass('smm-associative-line-container')
    }
    // ??
    this.svg = SVG().addTo(this.el).size(this.width, this.height)

    // ??
    this.draw = this.svg.group()
    this.draw.addClass('smm-container')
    // ??????
    this.lineDraw = this.draw.group()
    this.lineDraw.addClass('smm-line-container')
    // ????????
    if (!associativeLineIsAlwaysAboveNode) {
      createAssociativeLineDraw()
    }
    // ????
    this.nodeDraw = this.draw.group()
    this.nodeDraw.addClass('smm-node-container')
    // ???????????
    if (associativeLineIsAlwaysAboveNode) {
      createAssociativeLineDraw()
    }
    // ???????
    this.otherDraw = this.draw.group()
    this.otherDraw.addClass('smm-other-container')
  }

  // ?????
  clearDraw() {
    this.lineDraw.clear()
    this.associativeLineDraw.clear()
    this.nodeDraw.clear()
    this.otherDraw.clear()
  }

  // ?????css??
  // ??????????????????????svg??????svg???
  appendCss(key, str) {
    this.cssTextMap[key] = str
    this.removeCss()
    this.addCss()
  }

  // ?????css??
  removeAppendCss(key) {
    if (this.cssTextMap[key]) {
      delete this.cssTextMap[key]
      this.removeCss()
      this.addCss()
    }
  }

  // ?????css??
  joinCss() {
    return (
      cssContent +
      Object.keys(this.cssTextMap)
        .map(key => {
          return this.cssTextMap[key]
        })
        .join('\n')
    )
  }

  // ?????css?????
  addCss() {
    this.cssEl = document.createElement('style')
    this.cssEl.type = 'text/css'
    this.cssEl.innerHTML = this.joinCss()
    document.head.appendChild(this.cssEl)
  }

  // ??css
  removeCss() {
    if (this.cssEl) document.head.removeChild(this.cssEl)
  }

  // ???????????????????
  checkEditNodeClassIndex(className) {
    return this.editNodeClassList.findIndex(item => {
      return item === className
    })
  }

  // ??????????
  addEditNodeClass(className) {
    const index = this.checkEditNodeClassIndex(className)
    if (index === -1) {
      this.editNodeClassList.push(className)
    }
  }

  // ??????????
  deleteEditNodeClass(className) {
    const index = this.checkEditNodeClassIndex(className)
    if (index !== -1) {
      this.editNodeClassList.splice(index, 1)
    }
  }

  //  ???????
  render(callback, source = '') {
    this.initTheme()
    this.renderer.render(callback, source)
  }

  //  ????
  reRender(callback, source = '') {
    // ????????????????/????????pass?????
    // ???????????????????
    this.renderer.requestRender({ full: true })
    this.render(callback, source)
  }

  // ?????????????
  getElRectInfo() {
    this.elRect = this.el.getBoundingClientRect()
    this.width = this.elRect.width
    this.height = this.elRect.height
    if (this.width <= 0 || this.height <= 0)
      throw new Error('????el??????0')
  }

  //  ???????????
  resize() {
    const oldWidth = this.width
    const oldHeight = this.height
    this.getElRectInfo()
    this.svg.size(this.width, this.height)
    if (oldWidth !== this.width || oldHeight !== this.height) {
      // ?????????????????
      if (this.demonstrate) {
        // ??????????????????????????????????
        if (!this.demonstrate.isInDemonstrate) {
          this.render()
        }
      } else {
        this.render()
      }
    }
    this.emit('resize')
  }

  //  ????
  on(event, fn) {
    this.event.on(event, fn)
  }

  //  ????
  emit(event, ...args) {
    this.event.emit(event, ...args)
  }

  //  ????
  off(event, fn) {
    this.event.off(event, fn)
  }

  // ???????
  initCache() {
    this.commonCaches = {
      measureCustomNodeContentSizeEl: null,
      measureRichtextNodeTextSizeEl: null
    }
  }

  //  ????
  initTheme() {
    // ??????
    this.themeConfig = mergeTheme(
      theme[this.opt.theme] || theme.default,
      this.opt.themeConfig
    )
    // ??????
    Style.setBackgroundStyle(this.el, this.themeConfig)
  }

  //  ????
  setTheme(theme, notRender = false) {
    this.execCommand('CLEAR_ACTIVE_NODE')
    this.opt.theme = theme
    if (!notRender) {
      this.initTheme()
      this.render(null, CONSTANTS.CHANGE_THEME)
      if (!this.command.isPause) {
        this.command.addHistory()
      }
    }
    this.emit('view_theme_change', theme)
  }

  //  ??????
  getTheme() {
    return this.opt.theme
  }

  //  ??????
  setThemeConfig(config, notRender = false) {
    const nextThemeConfig = mergeTheme(
      theme[this.opt.theme] || theme.default,
      config
    )
    // ????????
    const changedConfig = getObjectChangedProps(this.themeConfig, nextThemeConfig)
    this.opt.themeConfig = config
    this.themeConfig = nextThemeConfig
    Style.setBackgroundStyle(this.el, this.themeConfig)
    if (!notRender) {
      // ???????????????????
      const res = checkIsNodeSizeIndependenceConfig(changedConfig)
      this.render(null, res ? '' : CONSTANTS.CHANGE_THEME)
      if (!this.command.isPause) {
        this.command.addHistory()
      }
    }
  }

  //  ?????????
  getCustomThemeConfig() {
    return this.opt.themeConfig
  }

  //  ?????????
  getThemeConfig(prop) {
    return prop === undefined ? this.themeConfig : this.themeConfig[prop]
  }

  // ????
  getConfig(prop) {
    return prop === undefined ? this.opt : this.opt[prop]
  }

  // ????
  updateConfig(opt = {}) {
    this.emit('before_update_config', this.opt)
    const lastOpt = {
      ...this.opt
    }
    const preservedRuntimeOpt = pickRuntimeMergeKeys(this.opt)
    this.opt = this.handleOpt(
      merge.all([
        defaultOpt,
        omitRuntimeMergeKeys(this.opt),
        omitRuntimeMergeKeys(opt)
      ])
    )
    applyRuntimeMergeKeys(this.opt, preservedRuntimeOpt)
    applyRuntimeMergeKeys(this.opt, pickRuntimeMergeKeys(opt))
    if (Object.prototype.hasOwnProperty.call(opt, 'el')) {
      this.el = this.opt.el
    }
    this.emit('after_update_config', this.opt, lastOpt)
  }

  //  ????????
  getLayout() {
    return this.opt.layout
  }

  //  ??????
  setLayout(layout, notRender = false) {
    // ??????
    if (!layoutValueList.includes(layout)) {
      layout = CONSTANTS.LAYOUT.LOGICAL_STRUCTURE
    }
    this.opt.layout = layout
    this.view.reset()
    this.renderer.setLayout()
    if (!notRender) {
      this.render(null, CONSTANTS.CHANGE_LAYOUT)
      if (!this.command.isPause) {
        this.command.addHistory()
      }
    }
    this.emit('layout_change', layout)
  }

  //  ????
  execCommand(...args) {
    return this.command.exec(...args)
  }

  // ???????????????????????????????????????????????????
  updateData(data, options = {}) {
    data = this.handleData(data)
    this.emit('before_update_data', data)
    this.renderer.setData(data)
    const preserveView = !!(options && options.preserveView)
    if (preserveView) {
      this.renderer.scheduleViewRestore(this.view.getTransformData())
    }
    this.render()
    this.command.addHistory()
    this.emit('update_data', data)
  }

  //  ????????????????
  setData(data) {
    data = this.handleData(data)
    this.emit('before_set_data', data)
    this.opt.data = data
    this.execCommand('CLEAR_ACTIVE_NODE')
    this.command.clearHistory()
    this.command.addHistory()
    this.renderer.setData(data)
    this.reRender()
    this.emit('set_data', data)
  }

  //  ??????????????????????????
  setFullData(data) {
    if (data.root) {
      this.setData(data.root)
    }
    // ???????????????????? setLayout ? view.reset()
    // ????? setTheme/setThemeConfig ?????????? Render.js
    // ??????? layoutChanged ???
    if (data.layout && data.layout !== this.opt.layout) {
      this.setLayout(data.layout)
    }
    if (data.theme) {
      if (data.theme.template && data.theme.template !== this.opt.theme) {
        this.setTheme(data.theme.template)
      }
      if (
        data.theme.config &&
        !isSameObject(data.theme.config, this.opt.themeConfig)
      ) {
        this.setThemeConfig(data.theme.config)
      }
    }
    if (data.view) {
      this.view.setTransformData(data.view)
    }
  }

  async syncEditingTextToNodeForSnapshot() {
    if (this.renderer && this.renderer.textEdit) {
      const synced = this.renderer.textEdit.syncEditingTextToNode()
      if (synced && typeof synced.then === 'function') {
        await synced
      }
      return !!synced
    }
    return false
  }

  async getDataForSnapshot(withConfig) {
    await this.syncEditingTextToNodeForSnapshot()
    this.command.originAddHistory()
    return this.getData(withConfig)
  }

  //  ???????????????????
  getData(withConfig) {
    const historyData = this.command.getCopyData()
    let nodeData = getRenderTreeFromHistorySnapshot(historyData)
    let data = {}
    if (withConfig) {
      data = {
        layout: this.getLayout(),
        root: nodeData,
        theme: {
          template: this.getTheme(),
          config: this.getCustomThemeConfig()
        },
        view: this.view.getTransformData()
      }
    } else {
      data = nodeData
    }
    return simpleDeepClone(data)
  }

  //  ??
  async export(...args) {
    try {
      if (!this.doExport) {
        throw new Error('???Export???')
      }
      let result = await this.doExport.export(...args)
      return result
    } catch (error) {
      this.opt.errorHandler(ERROR_TYPES.EXPORT_ERROR, error)
    }
  }

  //  ????
  toPos(x, y) {
    return {
      x: x - this.elRect.left,
      y: y - this.elRect.top
    }
  }

  //  ???????????
  setMode(mode) {
    if (![CONSTANTS.MODE.READONLY, CONSTANTS.MODE.EDIT].includes(mode)) {
      return
    }
    const isReadonly = mode === CONSTANTS.MODE.READONLY
    if (isReadonly === this.opt.readonly) return
    if (isReadonly) {
      // ?????????????????
      if (this.renderer.textEdit.isShowTextEdit()) {
        this.renderer.textEdit.hideEditTextBox()
        this.command.originAddHistory()
      }
      // ?????????
      this.execCommand('CLEAR_ACTIVE_NODE')
    }
    this.opt.readonly = isReadonly
    // ???????????????????????????????
    if (!isReadonly && this.command.history.length <= 0) {
      this.command.originAddHistory()
    }
    this.emit('mode_change', mode)
  }

  // ??svg??
  getSvgData({
    paddingX = 0,
    paddingY = 0,
    ignoreWatermark = false,
    addContentToHeader,
    addContentToFooter,
    node
  } = {}) {
    const { watermarkConfig, openPerformance } = this.opt
    // ?????????????????????
    if (openPerformance) {
      this.renderer.forceLoadNode(node)
    }
    const { cssTextList, header, headerHeight, footer, footerHeight } =
      handleGetSvgDataExtraContent({
        addContentToHeader,
        addContentToFooter
      })
    const svg = this.svg
    const draw = this.draw
    // ??????
    const origWidth = svg.width()
    const origHeight = svg.height()
    const origTransform = draw.transform()
    const elRect = this.elRect
    // ???????????
    draw.scale(1 / origTransform.scaleX, 1 / origTransform.scaleY)
    // ????????????????getBoundingClientRect???????
    const rect = draw.rbox()
    // ???????
    let clipData = null
    if (node) {
      clipData = getNodeTreeBoundingRect(
        node,
        rect.x,
        rect.y,
        paddingX,
        paddingY
      )
    }
    // ???
    const fixHeight = 0
    rect.width += paddingX * 2
    rect.height += paddingY * 2 + fixHeight + headerHeight + footerHeight
    draw.translate(paddingX, paddingY)
    // ?svg??????????
    svg.size(rect.width, rect.height)
    // ???????
    draw.translate(-rect.x + elRect.left, -rect.y + elRect.top)
    // ??????
    let clone = svg.clone()
    // ??????
    const hasWatermark = this.watermark && this.watermark.hasWatermark()
    if (!ignoreWatermark && hasWatermark) {
      this.watermark.isInExport = true
      // ???????????
      const { onlyExport } = watermarkConfig
      // ??????????
      const needReDrawWatermark =
        rect.width > origWidth || rect.height > origHeight
      // ????????????????????????????????????????????????
      if (needReDrawWatermark) {
        this.width = rect.width
        this.height = rect.height
        this.watermark.onResize()
        clone = svg.clone()
        this.width = origWidth
        this.height = origHeight
        this.watermark.onResize()
      } else if (onlyExport) {
        // ????????????????????
        this.watermark.onResize()
        clone = svg.clone()
      }
      // ????????????????
      if (onlyExport) {
        this.watermark.clear()
      }
      this.watermark.isInExport = false
    }
    // ???????
    [this.joinCss(), ...cssTextList].forEach(s => {
      clone.add(SVG(`<style>${s}</style>`))
    })
    // ????
    if (header && headerHeight > 0) {
      clone.findOne('.smm-container').translate(0, headerHeight)
      header.width(rect.width)
      header.y(paddingY)
      clone.add(header, 0)
    }
    if (footer && footerHeight > 0) {
      footer.width(rect.width)
      footer.y(rect.height - paddingY - footerHeight)
      clone.add(footer)
    }
    // ??defs???????id???clone?defs?????id???????????????id???
    const defs = svg.find('defs')
    const defs2 = clone.find('defs')
    defs.forEach((def, defIndex) => {
      const def2 = defs2[defIndex]
      if (!def2) return
      const children = def.children()
      const children2 = def2.children()
      for (let i = 0; i < children.length; i++) {
        const child = children[i]
        const child2 = children2[i]
        if (child && child2) {
          child2.attr('id', child.attr('id'))
        }
      }
    })
    // ????????????
    svg.size(origWidth, origHeight)
    draw.transform(origTransform)
    return {
      svg: clone, // ?????????svg??????svg???????g??????????
      svgHTML: clone.svg(), // svg???
      clipData,
      rect: {
        ...rect, // ??????????????????
        ratio: rect.width / rect.height // ??????????
      },
      origWidth, // ????
      origHeight, // ????
      scaleX: origTransform.scaleX, // ????????????
      scaleY: origTransform.scaleY // ????????????
    }
  }

  // ??????
  addShape(shape) {
    if (!shape) return
    const exist = this.extendShapeList.find(item => {
      return item.name === shape.name
    })
    if (exist) return
    this.extendShapeList.push(shape)
  }

  // ???????
  removeShape(name) {
    const index = this.extendShapeList.findIndex(item => {
      return item.name === name
    })
    if (index !== -1) {
      this.extendShapeList.splice(index, 1)
    }
  }

  // ??SVG.js??????
  getSvgObjects() {
    return {
      SVG,
      G,
      Rect
    }
  }

  // ????
  addPlugin(plugin, opt) {
    let index = MindMap.hasPlugin(plugin)
    if (index === -1) {
      MindMap.usePlugin(plugin, opt)
    }
    this.initPlugin(plugin)
  }

  // ????
  removePlugin(plugin) {
    let index = MindMap.hasPlugin(plugin)
    if (index !== -1) {
      if (this[plugin.instanceName]) {
        if (this[plugin.instanceName].beforePluginRemove) {
          this[plugin.instanceName].beforePluginRemove()
        }
        delete this[plugin.instanceName]
      }
      MindMap.removePlugin(plugin)
    }
  }

  // ?????
  initPlugin(plugin) {
    if (this[plugin.instanceName]) return
    this[plugin.instanceName] = new plugin({
      mindMap: this,
      pluginOpt: plugin.pluginOpt
    })
  }

  // ??
  destroy() {
    this.emit('beforeDestroy')
    // ???????
    this.renderer.textEdit.hideEditTextBox()
    this.renderer.textEdit.removeTextEditEl()
    // ????
    ;[...MindMap.pluginList].forEach(plugin => {
      if (
        this[plugin.instanceName] &&
        this[plugin.instanceName].beforePluginDestroy
      ) {
        this[plugin.instanceName].beforePluginDestroy()
      }
      this[plugin.instanceName] = null
    })
    // ????
    this.event.unbind()
    // ??????
    this.svg.remove()
    // ??????????????
    Style.removeBackgroundStyle(this.el)
    // ????????????
    this.el.classList.remove('smm-mind-map-container')
    this.el.innerHTML = ''
    this.el = null
    this.removeCss()
    MindMap.instanceCount--
  }
}

// ???????????????
// ?????????????????????????????????
/*
???????????

{
  data: {
    text: '',
    note: '',
    color: ''
  },
  children: []
}

color????nodeDataNoStylePropList????????????????????????????????????????????`_`???????????????
*/
let _extendNodeDataNoStylePropList = []
MindMap.extendNodeDataNoStylePropList = (list = []) => {
  _extendNodeDataNoStylePropList.push(...list)
  nodeDataNoStylePropList.push(...list)
}
MindMap.resetNodeDataNoStylePropList = () => {
  _extendNodeDataNoStylePropList.forEach(item => {
    const index = nodeDataNoStylePropList.findIndex(item2 => {
      return item2 === item
    })
    if (index !== -1) {
      nodeDataNoStylePropList.splice(index, 1)
    }
  })
  _extendNodeDataNoStylePropList = []
}

// ????
MindMap.pluginList = []
MindMap.usePlugin = (plugin, opt = {}) => {
  if (MindMap.hasPlugin(plugin) !== -1) return MindMap
  plugin.pluginOpt = opt
  MindMap.pluginList.push(plugin)
  return MindMap
}
MindMap.removePlugin = plugin => {
  const index = MindMap.hasPlugin(plugin)
  if (index !== -1) {
    MindMap.pluginList.splice(index, 1)
  }
  return MindMap
}
MindMap.hasPlugin = plugin => {
  return MindMap.pluginList.findIndex(item => {
    return item === plugin
  })
}
MindMap.instanceCount = 0

// ?????
MindMap.defineTheme = (name, config = {}) => {
  if (theme[name]) {
    return new Error('????????')
  }
  theme[name] = mergeTheme(defaultTheme, config)
}
// ????
MindMap.removeTheme = name => {
  if (theme[name]) {
    theme[name] = null
  }
}

export default MindMap
