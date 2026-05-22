import Quill from 'quill'
import Delta from 'quill-delta'
import 'quill/dist/quill.snow.css'
import {
  walk,
  getTextFromHtml,
  isUndef,
  checkSmmFormatData,
  formatGetNodeGeneralization,
  getNodeRichTextStyles,
  htmlEscape,
  compareVersion
} from '../utils'
import { richTextSupportStyleList } from '../constants/constant'
import MindMapNode from '../core/render/node/MindMapNode'
import { Scope } from 'parchment'
import {
  debugMindMap,
  summarizeHtml,
  summarizeMarkdown,
  summarizeNodeForDebug
} from '../utils/mindMapDebug'
import TableUp, {
  TableMenuContextmenu,
  TableResizeBox,
  TableSelection
} from 'quill-table-up'
import 'quill-table-up/dist/index.css'
import MarkdownShortcuts from './markdown/MarkdownShortcuts'
import { looksLikeMarkdown } from './markdown/markdownPaste'
import {
  appendMarkdownBlockToSource,
  getClipboardMarkdownFromNode,
  isFullQuillSelection
} from './markdown/markdownClipboard'
import {
  createMarkdownNodeData,
  createMarkdownNodeDataFromHtml,
  createMarkdownRenderCache,
  resolveMarkdownNodeHtml,
  setMarkdownRenderCacheNormalizer
} from './markdown/markdownStorage'
import { getEditorAndRenderedMarkdownCss } from './markdown/markdownStyles'

let extended = false

// 扩展quill的字体列表
let fontFamilyList = [
  '宋体, SimSun, Songti SC',
  '微软雅黑, Microsoft YaHei',
  '楷体, 楷体_GB2312, SimKai, STKaiti',
  '黑体, SimHei, Heiti SC',
  '隶书, SimLi',
  'andale mono',
  'arial, helvetica, sans-serif',
  'arial black, avant garde',
  'comic sans ms',
  'impact, chicago',
  'times new roman',
  'sans-serif',
  'serif'
]

// 扩展quill的字号列表
let fontSizeList = new Array(100).fill(0).map((_, index) => {
  return index + 'px'
})

const RICH_TEXT_EDIT_WRAP = 'ql-editor'
const BlockEmbed = Quill.import('blots/block/embed')

class DividerBlot extends BlockEmbed {
  static blotName = 'divider'
  static tagName = 'hr'
}

const QuillImage = Quill.import('formats/image')

class SafeImageBlot extends QuillImage {
  static create(value) {
    const node = super.create(value)
    if (typeof value === 'string') {
      node.setAttribute('src', value)
    }
    node.setAttribute('loading', 'lazy')
    node.style.pointerEvents = 'none'
    node.draggable = false
    node.addEventListener('error', () => {
      node.style.display = 'none'
    })
    return node
  }
}
SafeImageBlot.blotName = 'image'
SafeImageBlot.tagName = 'IMG'

const getLineFormats = (quill, context) => {
  return Object.keys(context.format).reduce((formats, format) => {
    if (
      quill.scroll.query(format, Scope.BLOCK) &&
      !Array.isArray(context.format[format])
    ) {
      formats[format] = context.format[format]
    }
    return formats
  }, {})
}

const insertLineBreak = function (range, context) {
  const lineFormats = getLineFormats(this.quill, context)
  const delta = new Delta()
    .retain(range.index)
    .delete(range.length)
    .insert('\n', lineFormats)
  this.quill.updateContents(delta, Quill.sources.USER)
  this.quill.setSelection(range.index + 1, Quill.sources.SILENT)
  this.quill.focus()
  Object.keys(context.format).forEach(name => {
    if (lineFormats[name] != null) return
    if (Array.isArray(context.format[name])) return
    if (name === 'code' || name === 'link') return
    this.quill.format(name, context.format[name], Quill.sources.USER)
  })
}

const handleEnterKey = function (range, context) {
  if (
    context.format['code-block'] ||
    context.format.list ||
    context.format.blockquote
  ) {
    insertLineBreak.call(this, range, context)
  }
  // 返回 false 让普通节点仍保持 Enter 结束编辑的既有行为。
  return false
}

// 富文本编辑插件
class RichText {
  constructor({ mindMap, pluginOpt }) {
    this.mindMap = mindMap
    this.pluginOpt = pluginOpt
    this.textEditNode = null
    this.showTextEdit = false
    this.quill = null
    this.range = null
    this.lastRange = null
    this.pasteUseRange = null
    this.node = null
    this.isInserting = false
    this.styleEl = null
    this.cacheEditingText = ''
    this.isCompositing = false
    this.isPastingMarkdown = false
    this.pendingMarkdownSource = ''
    this.editStartHtml = ''
    this.hasUserEdited = false
    this.isInitializingQuill = false
    this.isProgrammaticChange = false
    this.mindMap.addEditNodeClass(RICH_TEXT_EDIT_WRAP)
    this.initOpt()
    this.extendQuill()
    this.appendCss()
    this.bindEvent()

    this.handleDataToRichTextOnInit()
  }

  // 绑定事件
  bindEvent() {
    this.onCompositionStart = this.onCompositionStart.bind(this)
    this.onCompositionUpdate = this.onCompositionUpdate.bind(this)
    this.onCompositionEnd = this.onCompositionEnd.bind(this)
    this.handleSetData = this.handleSetData.bind(this)
    window.addEventListener('compositionstart', this.onCompositionStart)
    window.addEventListener('compositionupdate', this.onCompositionUpdate)
    window.addEventListener('compositionend', this.onCompositionEnd)
    this.mindMap.on('before_update_data', this.handleSetData)
    this.mindMap.on('before_set_data', this.handleSetData)
  }

  // 解绑事件
  unbindEvent() {
    window.removeEventListener('compositionstart', this.onCompositionStart)
    window.removeEventListener('compositionupdate', this.onCompositionUpdate)
    window.removeEventListener('compositionend', this.onCompositionEnd)
    this.mindMap.off('before_update_data', this.handleSetData)
    this.mindMap.off('before_set_data', this.handleSetData)
  }

  // 插入样式
  appendCss() {
    this.mindMap.appendCss(
      'richText',
      `
      .smm-richtext-node-wrap {
        word-break: break-all;
        user-select: none;
      }

      ${getEditorAndRenderedMarkdownCss()}

      .ql-editor .ql-align-left, 
      .smm-richtext-node-wrap .ql-align-left {
        text-align: left;
      }

      .smm-richtext-node-wrap .ql-align-right {
        text-align: right;
      }

      .smm-richtext-node-wrap .ql-align-center {
        text-align: center;
      }
      `
    )
    let cssText = `
      .${RICH_TEXT_EDIT_WRAP} {
        overflow: hidden;
        padding: 0;
        height: auto;
        line-height: 1.2;
        -webkit-user-select: text;
        text-align: inherit;
      }

      .smm-richtext-node-edit-wrap {
        background: transparent !important;
        box-shadow: none !important;
      }

      .smm-richtext-node-edit-wrap .ql-editor {
        caret-color: #111827;
        color: inherit;
      }

      .smm-richtext-node-edit-wrap .ql-container {
        pointer-events: auto;
      }

      .smm-richtext-node-edit-wrap .ql-tooltip {
        display: none !important;
      }
      
      .ql-container {
        height: auto;
        font-size: inherit;
      }

      .ql-container.ql-snow {
        border: none;
      }
    `
    this.styleEl = document.createElement('style')
    this.styleEl.type = 'text/css'
    this.styleEl.innerHTML = cssText
    document.head.appendChild(this.styleEl)
  }

  // 处理选项参数
  initOpt() {
    if (
      this.pluginOpt.fontFamilyList &&
      Array.isArray(this.pluginOpt.fontFamilyList)
    ) {
      fontFamilyList = this.pluginOpt.fontFamilyList
    }
    if (
      this.pluginOpt.fontSizeList &&
      Array.isArray(this.pluginOpt.fontSizeList)
    ) {
      fontSizeList = this.pluginOpt.fontSizeList
    }
  }

  // 扩展quill编辑器
  extendQuill() {
    if (extended) {
      return
    }
    extended = true

    this.extendFont([])

    this.extendAlign()

    Quill.register('modules/markdownShortcuts', MarkdownShortcuts, true)
    Quill.register({ [`modules/${TableUp.moduleName}`]: TableUp }, true)
    Quill.register(DividerBlot, true)
    Quill.register('formats/image', SafeImageBlot, true)
    setMarkdownRenderCacheNormalizer(html => this.normalizeHtmlWithQuill(html))

    // 扩展quill的字号列表
    const SizeAttributor = Quill.import('attributors/class/size')
    SizeAttributor.whitelist = fontSizeList
    Quill.register(SizeAttributor, true)

    const SizeStyle = Quill.import('attributors/style/size')
    SizeStyle.whitelist = fontSizeList
    Quill.register(SizeStyle, true)
  }

  // 扩展字体列表
  extendFont(list = [], cover = false) {
    fontFamilyList = cover ? [...list] : [...fontFamilyList, ...list]

    // 扩展quill的字体列表
    const FontAttributor = Quill.import('attributors/class/font')
    FontAttributor.whitelist = fontFamilyList
    Quill.register(FontAttributor, true)

    const FontStyle = Quill.import('attributors/style/font')
    FontStyle.whitelist = fontFamilyList
    Quill.register(FontStyle, true)
  }

  // 扩展文本对齐方式
  extendAlign() {
    const AlignFormat = Quill.import('formats/align')
    AlignFormat.whitelist = ['right', 'center', 'justify', 'left']
    Quill.register(AlignFormat, true)
  }

  normalizeHtmlWithQuill(html) {
    const container = document.createElement('div')
    container.style.display = 'none'
    document.body.appendChild(container)
    const quill = new Quill(container, {
      modules: {
        toolbar: false,
        [TableUp.moduleName]: {
          modules: []
        }
      },
      formats: [
        'bold',
        'italic',
        'underline',
        'strike',
        'color',
        'background',
        'font',
        'size',
        'formula',
        'align',
        'header',
        'list',
        'blockquote',
        'code-block',
        'code',
        'link',
        'indent',
        'image',
        'divider',
        'table',
        'table-up',
        'table-up-container',
        'table-up-main',
        'table-up-head',
        'table-up-body',
        'table-up-foot',
        'table-up-colgroup',
        'table-up-col',
        'table-up-row',
        'table-up-cell',
        'table-up-cell-inner',
        'table-up-caption'
      ],
      theme: null
    })
    quill.clipboard.dangerouslyPasteHTML(0, html || '', Quill.sources.SILENT)
    const normalizedHtml = quill.container.firstChild.innerHTML
    document.body.removeChild(container)
    return this.normalizeRichTextSaveHtml(normalizedHtml)
  }

  // 显示文本编辑控件
  showEditText({ node, rect, e, isInserting, isFromKeyDown, isFromScale }) {
    if (this.showTextEdit) {
      debugMindMap('mindmap-richtext', 'showEditText skipped: already editing', {
        currentNode: summarizeNodeForDebug(this.node),
        nextNode: summarizeNodeForDebug(node)
      })
      return
    }
    const start = performance.now()
    let {
      customInnerElsAppendTo,
      nodeTextEditZIndex,
      textAutoWrapWidth,
      selectTextOnEnterEditText,
      transformRichTextOnEnterEdit,
      openRealtimeRenderOnNodeTextEdit,
      autoEmptyTextWhenKeydownEnterEdit
    } = this.mindMap.opt
    textAutoWrapWidth = node.hasCustomWidth()
      ? node.customTextWidth
      : textAutoWrapWidth
    this.node = node
    this.isInserting = isInserting
    if (!rect) rect = node._textData.node.node.getBoundingClientRect()
    if (this.textEditNode) {
      this.textEditNode.style.visibility = 'hidden'
    }
    if (!isFromScale) {
      this.mindMap.emit('before_show_text_edit')
    }
    this.mindMap.renderer.textEdit.registerTmpShortcut()
    // 原始宽高
    let g = node._textData.node
    let originWidth = g.attr('data-width')
    let originHeight = g.attr('data-height')
    if (!this.textEditNode) {
      this.textEditNode = document.createElement('div')
      this.textEditNode.classList.add('smm-richtext-node-edit-wrap')
      this.textEditNode.style.cssText = `
        position:fixed;
        box-sizing: border-box;
        ${
          openRealtimeRenderOnNodeTextEdit
            ? ''
            : 'box-shadow: 0 0 20px rgba(0,0,0,.5);'
        }
        outline: none;
        word-break: break-all;
        padding: 0;
        line-height: 1.2;
        visibility: hidden;
      `
      this.textEditNode.addEventListener('click', e => {
        e.stopPropagation()
      })
      this.textEditNode.addEventListener(
        'mousedown',
        this.handleRichTextEditMousedown
      )
      this.textEditNode.addEventListener(
        'dblclick',
        this.preventDefaultRichTextSelection
      )
      this.textEditNode.addEventListener('keydown', e => {
        if (this.mindMap.renderer.textEdit.checkIsAutoEnterTextEditKey(e)) {
          e.stopPropagation()
        }
      })
      const targetNode = customInnerElsAppendTo || document.body
      targetNode.appendChild(this.textEditNode)
    }
    this.addNodeTextStyleToTextEditNode(node)
    this.textEditNode.style.zIndex = nodeTextEditZIndex
    if (!openRealtimeRenderOnNodeTextEdit) {
      this.textEditNode.style.background =
        this.mindMap.renderer.textEdit.getBackground(node)
    }
    this.applyRenderedGeometryToTextEditNode({
      rect,
      originHeight
    })
    this.textEditNode.style.transform = ''
    this.textEditNode.style.transformOrigin = ''
    // 节点文本内容。Markdown 是主内容，HTML 只作为渲染缓存。
    const renderHtml = this.getNodeEditHtml(node)
    let nodeText = this.getNodeEditHtmlForQuill(node, renderHtml)
    if (typeof transformRichTextOnEnterEdit === 'function') {
      nodeText = transformRichTextOnEnterEdit(nodeText)
    }
    debugMindMap('mindmap-richtext', 'showEditText before initQuill', {
      node: summarizeNodeForDebug(node),
      flags: { isInserting, isFromKeyDown, isFromScale },
      openRealtimeRenderOnNodeTextEdit,
      origin: { width: originWidth, height: originHeight },
      rect: {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      renderHtml: summarizeHtml(renderHtml),
      text: summarizeHtml(nodeText)
    })
    // 是否是空文本
    const isEmptyText = isUndef(nodeText)
    // 是否是非空的非富文本
    const noneEmptyNoneRichText = !node.getData('richText') && !isEmptyText
    if (isFromKeyDown && autoEmptyTextWhenKeydownEnterEdit) {
      this.textEditNode.innerHTML = ''
    } else if (noneEmptyNoneRichText) {
      // 还不是富文本
      let text = String(nodeText).split(/\n/gim).join('<br>')
      let html = `<p>${text}</p>`
      this.textEditNode.innerHTML = this.cacheEditingText || html
    } else {
      // 已经是富文本
      this.textEditNode.innerHTML = this.cacheEditingText || nodeText
    }
    debugMindMap('mindmap-richtext', 'showEditText assigned edit html', {
      node: summarizeNodeForDebug(node),
      assignedHtml: summarizeHtml(this.textEditNode.innerHTML)
    })
    this.isInitializingQuill = true
    this.initQuillEditor()
    this.isInitializingQuill = false
    debugMindMap('mindmap-richtext', 'showEditText after initQuill', {
      node: summarizeNodeForDebug(node),
      quillLength: this.quill ? this.quill.getLength() : null,
      quillHtml: summarizeHtml(this.getEditText())
    })
    this.setQuillContainerMinHeight(originHeight)
    this.editStartHtml = this.getEditText()
    this.hasUserEdited = false
    this.setIsShowTextEdit(true)
    this.textEditNode.style.visibility = 'visible'
    // 如果是刚创建的节点，那么默认全选，否则普通激活不全选，除非selectTextOnEnterEditText配置为true
    // 在selectTextOnEnterEditText时，如果是在keydown事件进入的节点编辑，也不需要全选
    if (isInserting || (selectTextOnEnterEditText && !isFromKeyDown)) {
      this.focus(0)
    } else if (e) {
      this.focusQuillAtPoint(e)
    } else {
      this.focus(null)
    }
    this.cacheEditingText = ''
    debugMindMap('mindmap-richtext', 'showEditText done', {
      elapsed: Math.round(performance.now() - start),
      editor: {
        minWidth: this.textEditNode.style.minWidth,
        minHeight: this.textEditNode.style.minHeight,
        left: this.textEditNode.style.left,
        top: this.textEditNode.style.top,
        transform: this.textEditNode.style.transform
      },
      quillLength: this.quill ? this.quill.getLength() : null,
      html: summarizeHtml(this.textEditNode.innerHTML)
    })
  }

  getNodeEditHtml(node) {
    const markdown = node.getData('markdown')
    const cachedHtml = node.getData('text')
    const html = resolveMarkdownNodeHtml({
      markdown,
      html: cachedHtml
    })
    if (typeof markdown === 'string') {
      debugMindMap('mindmap-markdown', 'getNodeEditHtml markdown source', {
        node: summarizeNodeForDebug(node),
        markdown: summarizeMarkdown(markdown),
        html: summarizeHtml(html)
      })
      return html
    }
    debugMindMap('mindmap-markdown', 'getNodeEditHtml html cache', {
      node: summarizeNodeForDebug(node),
      html: summarizeHtml(html)
    })
    return html
  }

  getNodeEditHtmlForQuill(node, html = this.getNodeEditHtml(node)) {
    return html
  }

  preventDefaultRichTextSelection = e => {
    e.preventDefault()
    e.stopPropagation()
    if (this.showTextEdit && this.quill) {
      this.focusQuillAtPoint(e)
    }
  }

  handleRichTextEditMousedown = e => {
    e.stopPropagation()
    if (e.detail > 1) {
      e.preventDefault()
      this.clearBrowserSelection()
      requestAnimationFrame(() => this.focusQuillAtPoint(e))
    }
  }

  clearBrowserSelection() {
    const selection = window.getSelection && window.getSelection()
    if (selection && selection.removeAllRanges) {
      selection.removeAllRanges()
    }
  }

  setCollapsedQuillSelection(index) {
    if (!this.quill) return
    this.clearBrowserSelection()
    const maxIndex = Math.max(this.quill.getLength() - 1, 0)
    index = Math.min(Math.max(index, 0), maxIndex)
    this.quill.setSelection(index, 0, Quill.sources.SILENT)
    this.quill.focus()
    this.range = null
    this.mindMap.emit('rich_text_selection_change', false, null, null)
    debugMindMap('mindmap-richtext', 'setCollapsedQuillSelection', {
      node: summarizeNodeForDebug(this.node),
      index,
      maxIndex
    })
  }

  focusQuillAtPoint(e) {
    const range = document.caretRangeFromPoint
      ? document.caretRangeFromPoint(e.clientX, e.clientY)
      : null
    if (!range || !this.textEditNode.contains(range.startContainer)) {
      this.focus(null)
      return
    }
    const blot = Quill.find(range.startContainer, true)
    if (!blot || typeof blot.offset !== 'function') {
      this.focus(null)
      return
    }
    const index = blot.offset(this.quill.scroll) + range.startOffset
    this.setCollapsedQuillSelection(
      Math.min(index, Math.max(this.quill.getLength() - 1, 0))
    )
  }

  applyRenderedGeometryToTextEditNode({ rect, originHeight }) {
    const viewportWidth = Math.ceil(rect.width)
    this.textEditNode.style.marginLeft = ''
    this.textEditNode.style.marginTop = ''
    this.textEditNode.style.width = viewportWidth + 'px'
    this.textEditNode.style.minWidth = viewportWidth + 'px'
    this.textEditNode.style.maxWidth = viewportWidth + 'px'
    this.textEditNode.style.minHeight = Math.ceil(rect.height || originHeight) + 'px'
    this.textEditNode.style.left = rect.left + 'px'
    this.textEditNode.style.top = rect.top + 'px'
    this.textEditNode.style.display = 'block'
  }

  // 当openRealtimeRenderOnNodeTextEdit配置更新后需要更新编辑框样式
  onOpenRealtimeRenderOnNodeTextEditConfigUpdate(
    openRealtimeRenderOnNodeTextEdit
  ) {
    if (!this.textEditNode) return
    this.textEditNode.style.background = openRealtimeRenderOnNodeTextEdit
      ? 'transparent'
      : this.node
      ? this.mindMap.renderer.textEdit.getBackground(this.node)
      : ''
    this.textEditNode.style.boxShadow = openRealtimeRenderOnNodeTextEdit
      ? 'none'
      : '0 0 20px rgba(0,0,0,.5)'
  }

  // 将指定节点的文本样式添加到编辑框元素上
  addNodeTextStyleToTextEditNode(node) {
    const style = getNodeRichTextStyles(node)
    Object.keys(style).forEach(prop => {
      this.textEditNode.style[prop] = style[prop]
    })
  }

  // 设置quill编辑器容器的最小高度
  setQuillContainerMinHeight(minHeight) {
    document.querySelector('.' + RICH_TEXT_EDIT_WRAP).style.minHeight =
      minHeight + 'px'
  }

  // 更新文本编辑框的大小和位置
  updateTextEditNode() {
    if (!this.node) return
    const g = this.node._textData.node
    const rect = g.node.getBoundingClientRect()
    const originWidth = g.attr('data-width')
    const originHeight = g.attr('data-height')
    this.applyRenderedGeometryToTextEditNode({
      rect,
      originHeight
    })
    this.setQuillContainerMinHeight(originHeight)
  }

  // 删除文本编辑框元素
  removeTextEditEl() {
    if (!this.textEditNode) return
    const targetNode = this.mindMap.opt.customInnerElsAppendTo || document.body
    targetNode.removeChild(this.textEditNode)
  }

  // 获取当前正在编辑的内容
  getEditText() {
    // https://github.com/slab/quill/issues/4509
    const html = this.quill.container.firstChild.innerHTML.replace(/  +/g, match =>
      '&nbsp;'.repeat(match.length)
    )
    return this.normalizeRichTextSaveHtml(html)
  }

  getRealtimeEditText(html = this.getEditText()) {
    if (this.pendingMarkdownSource) {
      const markdownHtml = resolveMarkdownNodeHtml({
        markdown: this.pendingMarkdownSource,
        html
      })
      debugMindMap(
        'mindmap-markdown',
        'getRealtimeEditText pending markdown',
        {
          node: summarizeNodeForDebug(this.node),
          markdown: summarizeMarkdown(this.pendingMarkdownSource),
          html: summarizeHtml(markdownHtml)
        },
        { verbose: true }
      )
      return markdownHtml
    }
    const markdownSource = this.getCurrentMarkdownSource()
    if (markdownSource) {
      const markdownHtml = resolveMarkdownNodeHtml({
        markdown: markdownSource,
        html
      })
      debugMindMap(
        'mindmap-markdown',
        'getRealtimeEditText existing markdown',
        {
          node: summarizeNodeForDebug(this.node),
          markdown: summarizeMarkdown(markdownSource),
          html: summarizeHtml(markdownHtml)
        },
        { verbose: true }
      )
      return markdownHtml
    }
    return html
  }

  getCurrentMarkdownSource() {
    if (
      this.node &&
      !this.hasUserEdited &&
      typeof this.node.getData('markdown') === 'string'
    ) {
      return this.node.getData('markdown')
    }
    return ''
  }

  getEditMarkdown(html = this.getEditText()) {
    const markdown = createMarkdownNodeDataFromHtml({ html }).markdown
    debugMindMap('mindmap-markdown', 'getEditMarkdown html to markdown', {
      node: summarizeNodeForDebug(this.node),
      html: summarizeHtml(html),
      markdown: summarizeMarkdown(markdown)
    })
    return markdown
  }

  getEditableMarkdownSource(html = this.getEditText()) {
    if (this.pendingMarkdownSource) {
      return this.pendingMarkdownSource
    }
    if (this.node && typeof this.node.getData('markdown') === 'string') {
      return this.node.getData('markdown')
    }
    return this.getEditMarkdown(html)
  }

  normalizeRichTextSaveHtml(html) {
    return html.replace(/<p><br><\/p>$/, '')
  }

  // 隐藏文本编辑控件，即完成编辑
  hideEditText(nodes) {
    if (!this.showTextEdit) {
      debugMindMap(
        'mindmap-richtext',
        'hideEditText skipped: not editing',
        {},
        { verbose: true }
      )
      return
    }
    const start = performance.now()
    const { beforeHideRichTextEdit } = this.mindMap.opt
    if (typeof beforeHideRichTextEdit === 'function') {
      beforeHideRichTextEdit(this)
    }
    const html = this.getEditText()
    const list = nodes && nodes.length > 0 ? nodes : [this.node]
    const node = this.node
    const existingMarkdown = node && node.getData
      ? node.getData('markdown')
      : undefined
    const htmlChanged = this.hasUserEdited
    const markdownDecision = this.pendingMarkdownSource
      ? 'pendingMarkdownSource'
      : !htmlChanged && typeof existingMarkdown === 'string'
      ? 'existingMarkdownUnchanged'
      : 'convertedFromHtml'
    const markdown =
      this.pendingMarkdownSource ||
      (!htmlChanged && typeof existingMarkdown === 'string'
        ? existingMarkdown
        : this.getEditMarkdown(html))
    const renderHtml =
      typeof markdown === 'string' ? createMarkdownRenderCache(markdown) : html
    debugMindMap('mindmap-markdown', 'hideEditText save decision', {
      node: summarizeNodeForDebug(node),
      targetCount: list.length,
      htmlChanged,
      markdownDecision,
      editStartHtml: summarizeHtml(this.editStartHtml),
      html: summarizeHtml(html),
      renderHtml: summarizeHtml(renderHtml),
      existingMarkdown: summarizeMarkdown(existingMarkdown),
      pendingMarkdownSource: summarizeMarkdown(this.pendingMarkdownSource),
      savedMarkdown: summarizeMarkdown(markdown)
    })
    this.textEditNode.style.display = 'none'
    this.setIsShowTextEdit(false)
    this.mindMap.emit('rich_text_selection_change', false)
    this.restoreRenderedNodeVisibility()
    this.node = null
    this.isInserting = false
    this.pendingMarkdownSource = ''
    this.editStartHtml = ''
    this.hasUserEdited = false
    this.isProgrammaticChange = false
    list.forEach(node => {
      this.mindMap.execCommand(
        'SET_NODE_DATA',
        node,
        createMarkdownNodeData({
          markdown,
          html: renderHtml
        })
      )
      this.mindMap.render()
    })
    this.mindMap.emit('hide_text_edit', this.textEditNode, list, node)
    debugMindMap('mindmap-richtext', 'hideEditText done', {
      elapsed: Math.round(performance.now() - start),
      node: summarizeNodeForDebug(node),
      targetCount: list.length,
      html: summarizeHtml(html)
    })
  }

  restoreRenderedNodeVisibility() {
    if (this.node && this.node._textData && this.node._textData.node) {
      this.node._textData.node.show()
    }
  }

  // 初始化Quill富文本编辑器
  initQuillEditor() {
    const start = performance.now()
    this.quill = new Quill(this.textEditNode, {
      modules: {
        toolbar: false,
        keyboard: {
          bindings: {
            enter: {
              key: 'Enter',
              handler: function (range, context) {
                return handleEnterKey.call(this, range, context)
              }
            },
            shiftEnter: {
              key: 'Enter',
              shiftKey: true,
              handler: function (range, context) {
                // 覆盖默认的换行，默认情况下新行的样式会丢失
                insertLineBreak.call(this, range, context)
              }
            },
            tab: {
              key: 9,
              handler: function () {
                // 覆盖默认的tab键
              }
            }
          }
        },
        markdownShortcuts: {},
        [TableUp.moduleName]: {
          modules: [
            { module: TableSelection },
            { module: TableResizeBox },
            { module: TableMenuContextmenu }
          ]
        }
      },
      formats: [
        'bold',
        'italic',
        'underline',
        'strike',
        'color',
        'background',
        'font',
        'size',
        'formula',
        'align',
        'header',
        'list',
        'blockquote',
        'code-block',
        'code',
        'link',
        'indent',
        'image',
        'divider',
        'table',
        'table-up',
        'table-up-container',
        'table-up-main',
        'table-up-head',
        'table-up-body',
        'table-up-foot',
        'table-up-colgroup',
        'table-up-col',
        'table-up-row',
        'table-up-cell',
        'table-up-cell-inner',
        'table-up-caption'
      ],
      theme: 'snow'
    })
    debugMindMap('mindmap-richtext', 'initQuillEditor done', {
      elapsed: Math.round(performance.now() - start),
      formats: this.quill ? this.quill.getFormat() : null,
      length: this.quill ? this.quill.getLength() : null
    })
    this.quill.clipboard.addMatcher('MARK', (node, delta) => {
      return delta.compose(
        new Delta().retain(delta.length(), {
          background: MARK_BACKGROUND
        })
      )
    })
    // 拦截复制事件，即Ctrl + c，去除多余的空行
    this.quill.root.addEventListener('copy', event => {
      event.preventDefault()
      const sel = window.getSelection()
      const originStr = sel.toString()
      try {
        const range = sel.getRangeAt(0)
        const div = document.createElement('div')
        div.appendChild(range.cloneContents())
        const quillRange = this.quill.getSelection()
        const fullSelection = isFullQuillSelection(
          quillRange,
          this.quill.getLength()
        )
        const markdown = getClipboardMarkdownFromNode({
          pendingMarkdownSource: this.pendingMarkdownSource,
          node: this.node,
          html: this.getEditText(),
          selectedHtml: div.innerHTML,
          fullSelection
        })
        event.clipboardData.setData('text/plain', markdown)
        event.clipboardData.setData('text/html', div.innerHTML)
      } catch (e) {
        event.clipboardData.setData('text/plain', originStr)
      }
    })
    this.quill.on('selection-change', range => {
      // 刚创建的节点全选不需要显示操作条
      if (this.isInserting) {
        this.isInserting = false
        return
      }
      this.lastRange = this.range
      this.range = null
      if (range) {
        this.pasteUseRange = range
        let bounds = this.quill.getBounds(range.index, range.length)
        let rect = this.textEditNode.getBoundingClientRect()
        let rectInfo = {
          left: bounds.left + rect.left,
          top: bounds.top + rect.top,
          right: bounds.right + rect.left,
          bottom: bounds.bottom + rect.top,
          width: bounds.width
        }
        let formatInfo = this.quill.getFormat(range.index, range.length)
        let hasRange = false
        if (range.length == 0) {
          hasRange = false
        } else {
          this.range = range
          hasRange = true
        }
        this.mindMap.emit(
          'rich_text_selection_change',
          hasRange,
          rectInfo,
          formatInfo
        )
      } else {
        this.mindMap.emit('rich_text_selection_change', false, null, null)
      }
    })
    this.quill.on('text-change', (delta, oldDelta, source) => {
      const isUserChange =
        source === Quill.sources.USER &&
        !this.isInitializingQuill &&
        !this.isProgrammaticChange &&
        !this.isPastingMarkdown
      if (isUserChange) {
        this.hasUserEdited = true
      }
      if (!this.isPastingMarkdown && isUserChange) {
        this.pendingMarkdownSource = ''
      }
      const isMarkdownNode =
        this.node &&
        this.node.getData &&
        (this.node.getData('richText') ||
          typeof this.node.getData('markdown') === 'string')
      const html = this.getRealtimeEditText()
      debugMindMap('mindmap-richtext', 'text-change', {
        node: summarizeNodeForDebug(this.node),
        source,
        isUserChange,
        isMarkdownNode,
        hasUserEdited: this.hasUserEdited,
        isInitializingQuill: this.isInitializingQuill,
        isProgrammaticChange: this.isProgrammaticChange,
        editLayerHtml: summarizeHtml(this.getEditText()),
        realtimeHtml: summarizeHtml(html)
      })
      if (isMarkdownNode) {
        debugMindMap(
          'mindmap-richtext',
          'text-change skipped markdown realtime render',
          {
            node: summarizeNodeForDebug(this.node),
            source,
            isUserChange,
            isPastingMarkdown: this.isPastingMarkdown,
            pendingMarkdownSource: summarizeMarkdown(this.pendingMarkdownSource),
            editLayerHtml: summarizeHtml(this.getEditText())
          }
        )
        return
      }
      if (!isUserChange) {
        return
      }
      this.mindMap.emit('node_text_edit_change', {
        node: this.node,
        text: html,
        richText: true,
        shouldRealtimeRender: true,
        source
      })
    })
    // 拦截粘贴，只允许粘贴纯文本
    // this.quill.clipboard.addMatcher(Node.TEXT_NODE, node => {
    //   let style = this.getPasteTextStyle()
    //   return new Delta().insert(this.formatPasteText(node.data), style)
    // })
    // 剪贴板里只要存在文本就会走这里，所以当剪贴板里是纯文本，或文本+图片都可以监听到和拦截，但是只有纯图片时不会走这里，所以无法拦截
    this.quill.clipboard.addMatcher(Node.ELEMENT_NODE, (node, delta) => {
      if (this.isPastingMarkdown) {
        return delta
      }
      let ops = []
      let style = this.getPasteTextStyle()
      delta.ops.forEach(op => {
        // 过滤出文本内容，过滤掉换行
        if (op.insert && typeof op.insert === 'string') {
          ops.push({
            attributes: { ...style },
            insert: this.formatPasteText(op.insert)
          })
        }
      })
      delta.ops = ops
      return delta
    })
    // 拦截图片的粘贴：将图片转换为 base64 内联插入
    this.quill.root.addEventListener(
      'paste',
      e => {
        if (
          e.clipboardData &&
          e.clipboardData.files &&
          e.clipboardData.files.length
        ) {
          let img = null
          Array.from(e.clipboardData.items || []).forEach(item => {
            if (item.type.indexOf('image') > -1) {
              img = item.getAsFile()
            }
          })
          if (img) {
            e.preventDefault()
            const reader = new FileReader()
            reader.onload = () => {
              const base64 = reader.result
              const range = this.quill.getSelection(true)
              const index = range ? range.index : this.quill.getLength()
              this.quill.insertEmbed(index, 'image', base64, Quill.sources.USER)
              this.quill.setSelection(index + 1, Quill.sources.SILENT)
              this.hasUserEdited = true
              this.pendingMarkdownSource = ''
            }
            reader.readAsDataURL(img)
            debugMindMap('mindmap-richtext', 'paste image inserted inline', {
              imageType: img.type || null,
              imageSize: img.size || 0
            })
          }
          return
        }
        if (this.handleStructuredHtmlPaste(e)) {
          return
        }
        if (this.handleMarkdownPaste(e)) {
          return
        }
      },
      true
    )
  }

  looksLikeStructuredHtml(html) {
    return /<(h[1-6]|strong|b|em|i|s|del|code|pre|blockquote|ol|ul|li|table|thead|tbody|tr|th|td|mark|a|img|hr)\b/i.test(
      html || ''
    )
  }

  pasteHtmlIntoQuill(html, range = this.quill.getSelection(true)) {
    const index = range ? range.index : this.quill.getLength()
    debugMindMap('mindmap-markdown', 'pasteHtmlIntoQuill start', {
      node: summarizeNodeForDebug(this.node),
      range,
      index,
      html: summarizeHtml(html)
    })
    this.isPastingMarkdown = true
    try {
      this.quill.clipboard.dangerouslyPasteHTML(index, html, Quill.sources.USER)
    } finally {
      this.isPastingMarkdown = false
    }
    debugMindMap('mindmap-markdown', 'pasteHtmlIntoQuill done', {
      node: summarizeNodeForDebug(this.node),
      quillLength: this.quill ? this.quill.getLength() : null,
      currentHtml: summarizeHtml(this.quill?.container?.firstChild?.innerHTML)
    })
    return true
  }

  handleStructuredHtmlPaste(e) {
    const html = e.clipboardData && e.clipboardData.getData('text/html')
    const text = e.clipboardData && e.clipboardData.getData('text/plain')
    if (!this.looksLikeStructuredHtml(html) || looksLikeMarkdown(text)) {
      return false
    }
    e.preventDefault()
    const range = this.quill.getSelection(true)
    debugMindMap('mindmap-richtext', 'handleStructuredHtmlPaste convert', {
      range,
      text: summarizeHtml(text),
      html: summarizeHtml(html)
    })
    debugMindMap('mindmap-markdown', 'handleStructuredHtmlPaste decision', {
      node: summarizeNodeForDebug(this.node),
      text: summarizeMarkdown(text),
      html: summarizeHtml(html),
      useStructuredHtml: true
    })
    return this.pasteHtmlIntoQuill(html, range)
  }

  // 粘贴 Markdown 文本时转换为 Quill 可编辑的富文本 HTML
  handleMarkdownPaste(e) {
    const text = e.clipboardData && e.clipboardData.getData('text/plain')
    if (!looksLikeMarkdown(text)) {
      debugMindMap('mindmap-richtext', 'handleMarkdownPaste skipped', {
        text: summarizeHtml(text)
      })
      return false
    }
    e.preventDefault()
    const range = this.quill.getSelection(true)
    const index = range ? range.index : this.quill.getLength()
    const currentMarkdown = this.getEditableMarkdownSource()
    const nextMarkdown = appendMarkdownBlockToSource(currentMarkdown, text)
    const html = resolveMarkdownNodeHtml({
      markdown: nextMarkdown
    })
    this.pendingMarkdownSource = nextMarkdown
    debugMindMap('mindmap-richtext', 'handleMarkdownPaste convert', {
      range,
      index,
      markdown: summarizeHtml(text),
      html: summarizeHtml(html)
    })
    debugMindMap('mindmap-markdown', 'handleMarkdownPaste decision', {
      node: summarizeNodeForDebug(this.node),
      range,
      index,
      markdown: summarizeMarkdown(text),
      nextMarkdown: summarizeMarkdown(nextMarkdown),
      html: summarizeHtml(html)
    })
    return this.replaceQuillWithMarkdownHtml(html)
  }

  replaceQuillWithMarkdownHtml(html) {
    debugMindMap('mindmap-markdown', 'replaceQuillWithMarkdownHtml start', {
      node: summarizeNodeForDebug(this.node),
      html: summarizeHtml(html)
    })
    this.isPastingMarkdown = true
    try {
      this.quill.setContents([], Quill.sources.SILENT)
      this.quill.clipboard.dangerouslyPasteHTML(0, html, Quill.sources.USER)
      this.quill.setSelection(this.quill.getLength() - 1, 0, Quill.sources.SILENT)
    } finally {
      this.isPastingMarkdown = false
    }
    debugMindMap('mindmap-markdown', 'replaceQuillWithMarkdownHtml done', {
      node: summarizeNodeForDebug(this.node),
      quillLength: this.quill ? this.quill.getLength() : null,
      currentHtml: summarizeHtml(this.quill?.container?.firstChild?.innerHTML)
    })
    return true
  }

  // 获取粘贴的文本的样式
  getPasteTextStyle() {
    // 粘贴的数据使用当前光标位置处的文本样式
    if (this.pasteUseRange) {
      return this.quill.getFormat(
        this.pasteUseRange.index,
        this.pasteUseRange.length
      )
    }
    return {}
  }

  // 处理粘贴的文本内容
  formatPasteText(text) {
    const { isSmm, data } = checkSmmFormatData(text)
    if (isSmm && data[0] && data[0].data) {
      // 只取第一个节点的纯文本
      return getTextFromHtml(data[0].data.text)
    } else {
      return text
    }
  }

  // 正则输入中文
  onCompositionStart() {
    if (!this.showTextEdit) {
      return
    }
    this.isCompositing = true
  }

  // 中文输入中
  onCompositionUpdate() {
    if (!this.showTextEdit || !this.node) return
    const isMarkdownNode =
      this.node &&
      this.node.getData &&
      (this.node.getData('richText') ||
        typeof this.node.getData('markdown') === 'string')
    if (isMarkdownNode) {
      debugMindMap(
        'mindmap-richtext',
        'composition skipped markdown realtime render',
        {
          node: summarizeNodeForDebug(this.node),
          editLayerHtml: summarizeHtml(this.getEditText())
        }
      )
      return
    }
    this.mindMap.emit('node_text_edit_change', {
      node: this.node,
      text: this.getEditText(),
      richText: true,
      shouldRealtimeRender: true,
      source: 'composition'
    })
  }

  // 中文输入结束
  onCompositionEnd() {
    if (!this.showTextEdit) {
      return
    }
    this.isCompositing = false
  }

  // 设置文本编辑框是否处于显示状态
  setIsShowTextEdit(val) {
    this.showTextEdit = val
    if (val) {
      this.mindMap.keyCommand.stopCheckInSvg()
    } else {
      this.mindMap.keyCommand.recoveryCheckInSvg()
    }
  }

  // 选中全部
  selectAll() {
    this.quill.setSelection(0, this.quill.getLength())
  }

  // 聚焦
  focus(start) {
    const len = this.quill.getLength()
    this.setCollapsedQuillSelection(typeof start === 'number' ? start : len)
  }

  // 格式化当前选中的文本
  formatText(config = {}, clear = false) {
    if (!this.range && !this.lastRange) return
    const rangeLost = !this.range
    const range = rangeLost ? this.lastRange : this.range
    if (clear) {
      this.quill.removeFormat(range.index, range.length)
    } else {
      const { align, ...rest } = config
      // 文本对齐需要对行进行格式化
      if (align) {
        this.quill.formatLine(range.index, range.length, 'align', align)
      }
      // 其他内容对文本
      if (Object.keys(rest).length > 0) {
        this.quill.formatText(range.index, range.length, rest)
      }
    }
    if (rangeLost) {
      this.quill.setSelection(this.lastRange.index, this.lastRange.length)
    }
  }

  // 清除当前选中文本的样式
  removeFormat() {
    this.formatText({}, true)
  }

  // 格式化指定范围的文本
  formatRangeText(range, config = {}) {
    if (!range) return
    this.quill.formatText(range.index, range.length, config)
  }

  // 格式化所有文本
  formatAllText(config = {}) {
    this.quill.formatText(0, this.quill.getLength(), config)
  }

  // 将普通节点样式对象转换成富文本样式对象
  normalStyleToRichTextStyle(style) {
    const config = {}
    Object.keys(style).forEach(prop => {
      const value = style[prop]
      switch (prop) {
        case 'fontFamily':
          config.font = value
          break
        case 'fontSize':
          config.size = value + 'px'
          break
        case 'fontWeight':
          config.bold = value === 'bold'
          break
        case 'fontStyle':
          config.italic = value === 'italic'
          break
        case 'textDecoration':
          config.underline = value === 'underline'
          config.strike = value === 'line-through'
          break
        case 'color':
          config.color = value
          break
        case 'textAlign':
          config.align = value
          break
        default:
          break
      }
    })
    return config
  }

  // 将富文本样式对象转换成普通节点样式对象
  richTextStyleToNormalStyle(config) {
    const data = {}
    Object.keys(config).forEach(prop => {
      const value = config[prop]
      switch (prop) {
        case 'font':
          data.fontFamily = value
          break
        case 'size':
          data.fontSize = parseFloat(value)
          break
        case 'bold':
          data.fontWeight = value ? 'bold' : 'normal'
          break
        case 'italic':
          data.fontStyle = value ? 'italic' : 'normal'
          break
        case 'underline':
          data.textDecoration = value ? 'underline' : 'none'
          break
        case 'strike':
          data.textDecoration = value ? 'line-through' : 'none'
          break
        case 'color':
          data.color = value
          break
        case 'align':
          data.textAlign = value
          break
        default:
          break
      }
    })
    return data
  }

  // 判断一个对象是否包含了富文本支持的样式字段
  isHasRichTextStyle(obj) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      if (richTextSupportStyleList.includes(key)) {
        return true
      }
    }
    return false
  }

  // 检查指定节点是否存在自定义的富文本样式
  checkNodeHasCustomRichTextStyle(node) {
    const nodeData = node instanceof MindMapNode ? node.getData() : node
    for (let i = 0; i < richTextSupportStyleList.length; i++) {
      if (nodeData[richTextSupportStyleList[i]] !== undefined) {
        return true
      }
    }
    return false
  }

  // 转换数据后的渲染操作
  afterHandleData() {
    // 清空历史数据，并且触发数据变化
    this.mindMap.command.clearHistory()
    this.mindMap.command.addHistory()
    this.mindMap.render()
  }

  // 插件实例化时处理思维导图数据，转换为富文本数据
  handleDataToRichTextOnInit() {
    // 处理数据，转成富文本格式
    if (this.mindMap.renderer.renderTree) {
      // 如果已经存在渲染树了，那么直接更新渲染树，并且触发重新渲染
      this.handleSetData(this.mindMap.renderer.renderTree)
      this.afterHandleData()
    } else if (this.mindMap.opt.data) {
      this.handleSetData(this.mindMap.opt.data)
    }
  }

  // 将所有节点转换成非富文本节点
  transformAllNodesToNormalNode() {
    const renderTree = this.mindMap.renderer.renderTree
    if (!renderTree) return
    walk(
      renderTree,
      null,
      node => {
        if (node.data.richText) {
          node.data.richText = false
          node.data.text = getTextFromHtml(node.data.text)
        }
        // 概要
        if (node.data) {
          const generalizationList = formatGetNodeGeneralization(node.data)
          generalizationList.forEach(item => {
            item.richText = false
            item.text = getTextFromHtml(item.text)
          })
        }
      },
      null,
      true,
      0,
      0
    )
    this.afterHandleData()
  }

  handleDataToRichText(data) {
    const oldIsRichText = data.richText
    data.richText = true
    data.resetRichText = true
    // 如果原本就是富文本，那么不能转换
    if (!oldIsRichText) {
      data.text = htmlEscape(data.text)
    }
  }

  // 处理导入数据
  handleSetData(data) {
    if (!data) return
    // 短期处理，为了兼容老数据，长期会去除
    const isOldRichTextVersion =
      !data.smmVersion || compareVersion(data.smmVersion, '0.13.0') === '<'
    const walk = root => {
      if (root.data && (!root.data.richText || isOldRichTextVersion)) {
        this.handleDataToRichText(root.data)
      }
      // 概要
      if (root.data) {
        const generalizationList = formatGetNodeGeneralization(root.data)
        generalizationList.forEach(item => {
          if (!item.richText || isOldRichTextVersion) {
            this.handleDataToRichText(item)
          }
        })
      }
      if (root.children && root.children.length > 0) {
        Array.from(root.children).forEach(item => {
          walk(item)
        })
      }
    }
    walk(data)
    return data
  }

  // 插件被移除前做的事情
  beforePluginRemove() {
    this.transformAllNodesToNormalNode()
    document.head.removeChild(this.styleEl)
    this.unbindEvent()
    this.mindMap.removeAppendCss('richText')
    this.mindMap.deleteEditNodeClass(RICH_TEXT_EDIT_WRAP)
  }

  // 插件被卸载前做的事情
  beforePluginDestroy() {
    document.head.removeChild(this.styleEl)
    this.unbindEvent()
    this.mindMap.deleteEditNodeClass(RICH_TEXT_EDIT_WRAP)
  }
}

RichText.instanceName = 'richText'

export default RichText
