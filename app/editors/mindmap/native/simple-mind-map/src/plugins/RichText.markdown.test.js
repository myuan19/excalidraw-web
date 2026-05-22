import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getEditorAndRenderedMarkdownCss,
  getRenderedMarkdownCss
} from './markdown/markdownStyles'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const richTextPath = path.join(__dirname, 'RichText.js')
const markdownPastePath = path.join(__dirname, 'markdown/markdownPaste.js')
const markdownStoragePath = path.join(__dirname, 'markdown/markdownStorage.js')
const markdownStylesPath = path.join(__dirname, 'markdown/markdownStyles.js')
const packagePath = path.join(__dirname, '../../package.json')

const read = filePath => fs.readFileSync(filePath, 'utf8')

describe('RichText Markdown WYSIWYG support', () => {
  it('allows Markdown-backed Quill formats in rich text nodes', () => {
    const source = read(richTextPath)

    expect(source).toContain("'header'")
    expect(source).toContain("'list'")
    expect(source).toContain("'blockquote'")
    expect(source).toContain("'code-block'")
    expect(source).toContain("'code'")
    expect(source).toContain("'link'")
    expect(source).toContain("'indent'")
    expect(source).toContain("'table'")
    expect(source).toContain("'table-up'")
    expect(source).toContain("'table-up-container'")
    expect(source).toContain("'table-up-main'")
    expect(source).toContain("'table-up-head'")
    expect(source).toContain("'table-up-body'")
    expect(source).toContain("'table-up-foot'")
    expect(source).toContain("'table-up-colgroup'")
    expect(source).toContain("'table-up-col'")
    expect(source).toContain("'table-up-row'")
    expect(source).toContain("'table-up-cell'")
    expect(source).toContain("'table-up-cell-inner'")
    expect(source).toContain("'table-up-caption'")
    expect(source).not.toContain("'table-up-wrapper'")
  })

  it('registers the Markdown shortcut module with Quill', () => {
    const source = read(richTextPath)

    expect(source).toContain("from './markdown/MarkdownShortcuts'")
    expect(source).toContain("Quill.register('modules/markdownShortcuts', MarkdownShortcuts, true)")
    expect(source).toMatch(/markdownShortcuts:\s*\{/)
  })

  it('keeps multiline Markdown blocks editable instead of swallowing Enter globally', () => {
    const source = read(richTextPath)

    expect(source).toContain('handleEnterKey.call(this, range, context)')
    expect(source).toContain("context.format['code-block']")
    expect(source).toContain('context.format.list')
    expect(source).toContain('context.format.blockquote')
  })

  it('adds display CSS for Markdown elements rendered inside foreignObject', () => {
    const source = getRenderedMarkdownCss()

    expect(source).toContain('.smm-richtext-node-wrap h1')
    expect(source).toContain('.smm-richtext-node-wrap blockquote')
    expect(source).toContain('.smm-richtext-node-wrap pre')
    expect(source).toContain('.smm-richtext-node-wrap pre code')
    expect(source).toContain('.smm-richtext-node-wrap table')
    expect(source).toContain('.smm-richtext-node-wrap th')
    expect(source).toContain('.smm-richtext-node-wrap img')
    expect(source).toContain('.smm-richtext-node-wrap .ql-code-block-container')
  })

  it('detects Markdown paste text and converts it to rich HTML', () => {
    const richTextSource = read(richTextPath)
    const pasteSource = read(markdownPastePath)

    expect(richTextSource).toContain("from './markdown/markdownPaste'")
    expect(richTextSource).not.toContain('markdownToHtml')
    expect(richTextSource).toContain('handleMarkdownPaste')
    expect(pasteSource).toContain('MarkdownIt')
    expect(pasteSource).toContain('looksLikeMarkdown')
    expect(pasteSource).toContain('renderMarkdownForQuill')
  })

  it('includes table support dependencies for full Markdown paste', () => {
    const pkg = JSON.parse(read(packagePath))

    expect(pkg.dependencies).toHaveProperty('markdown-it')
    expect(pkg.dependencies).toHaveProperty('quill-table-up')
    expect(pkg.dependencies).toHaveProperty('markdown-it-mark')
    expect(pkg.dependencies).toHaveProperty('katex')
  })

  it('keeps Markdown styles available when exporting rich text foreignObjects', () => {
    const source = read(path.join(__dirname, '../constants/defaultOptions.js'))

    expect(source).toContain('getRenderedMarkdownCss()')
    expect(source).not.toContain('.smm-richtext-node-wrap blockquote')
    expect(source).not.toContain('.smm-richtext-node-wrap pre,')
    expect(source).not.toContain('.smm-richtext-node-wrap table')
  })

  it('transpiles modern table editor dependencies in the Vue CLI build', () => {
    const source = read(path.join(__dirname, '../../../web/vue.config.js'))

    expect(source).toContain("'quill-table-up'")
    expect(source).toContain("'@floating-ui'")
  })

  it('renders saved rich text with the same Quill content class used while editing', () => {
    const source = read(
      path.join(__dirname, '../core/render/node/nodeCreateContents.js')
    )

    expect(source).toContain("el.classList.add('smm-richtext-node-wrap', 'ql-editor')")
  })

  it('uses the rendered rich text geometry when entering edit mode', () => {
    const source = read(richTextPath)

    expect(source).toContain('this.applyRenderedGeometryToTextEditNode')
    expect(source).not.toContain('marginLeft = `-${paddingX * scaleX}px`')
    expect(source).not.toContain('marginTop = `-${paddingY * scaleY}px`')
    expect(source).not.toContain('originWidth + paddingX * 2')
    expect(source).not.toContain('textAutoWrapWidth + paddingX * 2')
  })

  it('uses viewport geometry for the rich text edit overlay width', () => {
    const source = read(richTextPath)

    expect(source).toContain('const viewportWidth = Math.ceil(rect.width)')
    expect(source).toContain('this.textEditNode.style.width = viewportWidth +')
    expect(source).toContain('this.textEditNode.style.maxWidth = viewportWidth +')
    expect(source).not.toContain('this.textEditNode.style.minWidth = originWidth +')
    expect(source).not.toContain('this.textEditNode.style.maxWidth = textAutoWrapWidth +')
  })

  it('keeps Markdown code blocks within the same visual width while editing', () => {
    const source = getEditorAndRenderedMarkdownCss()

    expect(source).toMatch(/\.ql-editor pre,[\s\S]*?overflow-x:\s*auto/)
    expect(source).toMatch(/\.ql-editor pre,[\s\S]*?max-width:\s*100%/)
    expect(source).toMatch(/\.ql-editor pre code,[\s\S]*?white-space:\s*pre/)
  })

  it('normalizes Quill save HTML to avoid adding a trailing blank line', () => {
    const source = read(richTextPath)

    expect(source).toContain('normalizeRichTextSaveHtml')
    expect(source).toContain('.replace(/<p><br><\\/p>$/')
    expect(source).toContain('return this.normalizeRichTextSaveHtml(html)')
  })

  it('preserves Markdown paste structure instead of flattening it as plain text', () => {
    const source = read(richTextPath)

    expect(source).toContain("from './markdown/markdownClipboard'")
    expect(source).toContain('appendMarkdownBlockToSource')
    expect(source).toContain('this.isPastingMarkdown = true')
    expect(source).toContain('this.isPastingMarkdown = false')
    expect(source).toContain('if (this.isPastingMarkdown) {')
    expect(source).toContain('return delta')
    expect(source).toContain('this.pendingMarkdownSource = nextMarkdown')
    expect(source).toContain('this.pendingMarkdownSource ||')
    expect(source).toContain('this.getEditMarkdown(html)')
  })

  it('uses the pending Markdown source for realtime render while editing', () => {
    const source = read(richTextPath)

    expect(source).toContain('getRealtimeEditText')
    expect(source).toContain('resolveMarkdownNodeHtml')
    expect(source).toContain('const html = this.getRealtimeEditText()')
  })

  it('preserves structured clipboard HTML when copied text is no longer Markdown source', () => {
    const source = read(richTextPath)

    expect(source).toContain('handleStructuredHtmlPaste')
    expect(source).toContain("e.clipboardData.getData('text/html')")
    expect(source).toContain('looksLikeStructuredHtml')
    expect(source).toContain('this.pasteHtmlIntoQuill')
  })

  it('copies Markdown source from full editor selections and Markdown from partial selections', () => {
    const source = read(richTextPath)

    expect(source).toContain('getClipboardMarkdownFromNode')
    expect(source).toContain('isFullQuillSelection')
    expect(source).toContain('fullSelection')
    expect(source).toContain("event.clipboardData.setData('text/plain', markdown)")
    expect(source).toContain("event.clipboardData.setData('text/html', div.innerHTML)")
  })

  it('stores Markdown as the primary node content and keeps HTML as render cache', () => {
    const richTextSource = read(richTextPath)
    const renderSource = read(
      path.join(__dirname, '../core/render/node/nodeCreateContents.js')
    )
    const storageSource = read(markdownStoragePath)

    expect(storageSource).toContain('htmlToMarkdown')
    expect(storageSource).toContain('markdownToRenderHtml')
    expect(storageSource).toContain('resolveMarkdownNodeHtml')
    expect(storageSource).toContain('createMarkdownNodeData')
    expect(richTextSource).toContain("from './markdown/markdownStorage'")
    expect(renderSource).toContain("from '../../../plugins/markdown/markdownStorage'")
    expect(renderSource).toContain('resolveNodeRenderHtml')
    expect(richTextSource).toContain('getEditMarkdown')
    expect(richTextSource).toContain('createMarkdownNodeData')
  })

  it('resolves Markdown node HTML using markdown as source of truth with html cache', () => {
    const storageSource = read(markdownStoragePath)
    const renderSource = read(
      path.join(__dirname, '../core/render/node/nodeCreateContents.js')
    )

    expect(storageSource).not.toContain('isUnsafeEditCache')
    expect(storageSource).toContain('resolveMarkdownNodeHtml')
    expect(storageSource).toContain("typeof markdown === 'string'")
    expect(storageSource).toContain("typeof html === 'string' ? html : createMarkdownRenderCache(markdown)")
    expect(renderSource).toContain('resolveNodeRenderHtml')
  })

  it('does not overwrite Markdown source when editing is opened and closed without changes', () => {
    const source = read(richTextPath)

    expect(source).toContain('this.editStartHtml = this.getEditText()')
    expect(source).toContain('const htmlChanged = this.hasUserEdited')
    expect(source).toContain('const existingMarkdown = node && node.getData')
    expect(source).toContain('!htmlChanged && typeof existingMarkdown ===')
    expect(source).toContain('markdown: markdown')
  })

  it('does not treat Quill initialization or formula formatting as user edits', () => {
    const richTextSource = read(richTextPath)
    const formulaSource = read(path.join(__dirname, 'Formula.js'))

    expect(richTextSource).toContain('this.isInitializingQuill = false')
    expect(richTextSource).toContain('this.hasUserEdited = false')
    expect(richTextSource).toContain("source === Quill.sources.USER")
    expect(richTextSource).toContain('!this.isInitializingQuill')
    expect(richTextSource).toContain('this.hasUserEdited = true')
    expect(formulaSource).toContain('richText.isProgrammaticChange = true')
    expect(formulaSource).toContain('richText.isProgrammaticChange = false')
  })

  it('keeps Markdown-backed realtime render on the original Markdown until user edits', () => {
    const source = read(richTextPath)

    expect(source).toContain('getCurrentMarkdownSource')
    expect(source).toContain('!this.hasUserEdited')
    expect(source).toContain("this.node.getData('markdown')")
    expect(source).toContain('resolveMarkdownNodeHtml')
  })

  it('uses one shared Markdown style module for edit, render, and export CSS', () => {
    const richTextSource = read(richTextPath)
    const defaultOptionsSource = read(path.join(__dirname, '../constants/defaultOptions.js'))
    const styleSource = read(markdownStylesPath)

    expect(styleSource).toContain('getMarkdownCss')
    expect(styleSource).toContain('getEditorAndRenderedMarkdownCss')
    expect(styleSource).toContain('getRenderedMarkdownCss')
    expect(richTextSource).toContain("from './markdown/markdownStyles'")
    expect(richTextSource).toContain('getEditorAndRenderedMarkdownCss()')
    expect(defaultOptionsSource).toContain("from '../plugins/markdown/markdownStyles'")
    expect(defaultOptionsSource).toContain('getRenderedMarkdownCss()')
  })

  it('does not let RichText own Markdown render or save conversion details', () => {
    const source = read(richTextPath)

    expect(source).toContain('resolveMarkdownNodeHtml')
    expect(source).toContain('createMarkdownNodeData')
    expect(source).not.toContain('htmlToMarkdown(')
    expect(source).not.toContain('markdownToRenderHtml(')
    expect(source).not.toContain('markdownToHtml(')
  })

  it('logs detailed Markdown conversion and save decisions for debugging', () => {
    const richTextSource = read(richTextPath)
    const pasteSource = read(markdownPastePath)
    const storageSource = read(markdownStoragePath)
    const debugSource = read(
      path.join(__dirname, '../utils/mindMapDebug.js')
    )
    const renderSource = read(
      path.join(__dirname, '../core/render/Render.js')
    )

    expect(debugSource).toContain('summarizeMarkdown')
    expect(debugSource).toContain('hasCodeBlock')
    expect(debugSource).toContain('lineCount')
    expect(pasteSource).toContain("looksLikeMarkdown result")
    expect(pasteSource).toContain("markdownToHtml done")
    expect(storageSource).toContain("markdownToRenderHtml done")
    expect(storageSource).toContain("htmlToMarkdown done")
    expect(renderSource).toContain("renderer paste create node decision")
    expect(richTextSource).toContain("hideEditText save decision")
    expect(richTextSource).toContain("pasteHtmlIntoQuill start")
    expect(richTextSource).toContain("pasteHtmlIntoQuill done")
  })

  it('moves the Quill cursor on repeat clicks inside the node already being edited', () => {
    const source = read(
      path.join(__dirname, '../core/render/TextEdit.js')
    )

    expect(source).toContain('if (currentEditNode === node) {')
    expect(source).toContain("TextEdit.show refocus same rich text node")
    expect(source).toContain('this.mindMap.richText.focusQuillAtPoint(e)')
    expect(source).toContain('return')
  })

  it('keeps repeat clicks as a collapsed caret instead of browser word selection', () => {
    const richTextSource = read(richTextPath)

    expect(richTextSource).toContain("'dblclick'")
    expect(richTextSource).toContain('preventDefaultRichTextSelection')
    expect(richTextSource).toContain('setCollapsedQuillSelection')
    expect(richTextSource).toContain('clearBrowserSelection')
    expect(richTextSource).toContain('index = Math.min(Math.max(index, 0), maxIndex)')
    expect(richTextSource).toContain('this.quill.setSelection(index, 0, Quill.sources.SILENT)')
    expect(richTextSource).toContain("this.mindMap.emit('rich_text_selection_change', false")
    expect(richTextSource).toContain('handleRichTextEditMousedown')
    expect(richTextSource).toContain('if (e.detail > 1) {')
    expect(richTextSource).toContain('e.preventDefault()')
    expect(richTextSource).toContain('requestAnimationFrame(() => this.focusQuillAtPoint(e))')
    expect(richTextSource).toContain('caret-color: #111827')
    expect(richTextSource).not.toContain('caret-color: currentColor')
    expect(richTextSource).not.toContain(
      `this.quill.setSelection(typeof start === 'number' ? start : len, len)`
    )
  })

  it('does not redraw the rendered Markdown node while typing in the rich text layer', () => {
    const richTextSource = read(richTextPath)
    const renderSource = read(path.join(__dirname, '../core/render/Render.js'))

    expect(richTextSource).toContain('const isMarkdownNode =')
    expect(richTextSource).toContain('if (isMarkdownNode) {')
    expect(richTextSource).toContain('text-change skipped markdown realtime render')
    expect(richTextSource).not.toContain('const shouldRealtimeRender = isUserChange || this.isPastingMarkdown')
    expect(renderSource).toContain('if (richText && !shouldRealtimeRender)')
  })

  it('only places the edit cursor when the caret is inside the active editor', () => {
    const richTextSource = read(richTextPath)
    const textEditSource = read(
      path.join(__dirname, '../core/render/TextEdit.js')
    )

    expect(richTextSource).toContain('this.textEditNode.contains(range.startContainer)')
    expect(textEditSource).toContain('this.textEditNode.contains(range.startContainer)')
  })

  it('keeps rich text edit overlay geometry unscaled and hidden until content is ready', () => {
    const source = read(richTextPath)

    expect(source).toContain("this.textEditNode.style.visibility = 'hidden'")
    expect(source).toContain("this.textEditNode.style.visibility = 'visible'")
    expect(source).not.toContain('this.textEditNode.style.transform = `scale(${scaleX}, ${scaleY})`')
  })

  it('shows typed text in the Quill layer while hiding the rendered rich text layer', () => {
    const richTextSource = read(richTextPath)
    const textEditSource = read(
      path.join(__dirname, '../core/render/TextEdit.js')
    )

    expect(textEditSource).toContain('if (this.mindMap.richText)')
    expect(textEditSource).toContain('g.hide()')
    expect(richTextSource).toContain('restoreRenderedNodeVisibility')
    expect(richTextSource).toContain('pointer-events: auto')
    expect(richTextSource).toContain('caret-color')
    expect(richTextSource).toContain('color: inherit')
    expect(richTextSource).toContain('background: transparent !important')
    expect(richTextSource).not.toMatch(/^\s*color:\s*transparent/m)
    // Child elements must keep their styled backgrounds/borders visible in edit mode
    expect(richTextSource).not.toMatch(
      /\.smm-richtext-node-edit-wrap\s+\.ql-editor\s+\*[^}]*background:\s*transparent\s*!important/
    )
    expect(richTextSource).not.toMatch(
      /\.smm-richtext-node-edit-wrap\s+\.ql-editor\s+\*[^}]*border-color:\s*transparent\s*!important/
    )
  })

  it('edit layer CSS does not override child element backgrounds or borders', () => {
    const richTextSource = read(richTextPath)
    expect(richTextSource).not.toMatch(
      /\.smm-richtext-node-edit-wrap\s+\.ql-editor\s+\*/
    )
  })

  it('uses SafeImageBlot for safe inline image handling in edit mode', () => {
    const richTextSource = read(richTextPath)

    expect(richTextSource).toContain('SafeImageBlot')
    expect(richTextSource).toContain("Quill.register('formats/image', SafeImageBlot, true)")
    expect(richTextSource).toContain("loading', 'lazy'")
    expect(richTextSource).toContain('draggable = false')
    expect(richTextSource).toContain("node.addEventListener('error'")
    expect(richTextSource).toContain('node.style.pointerEvents')
    expect(richTextSource).not.toContain('SAFE_IMAGE_PLACEHOLDER')
    expect(richTextSource).not.toContain('data-smm-placeholder-image')
    expect(richTextSource).not.toContain('data-smm-original-src')
    expect(richTextSource).not.toContain('replaceImageSrcForQuillEdit')
    expect(richTextSource).not.toContain('restoreImageSrcFromQuillEdit')
  })

  it('inserts pasted images as inline base64 instead of node-level images', () => {
    const richTextSource = read(richTextPath)

    expect(richTextSource).toContain('paste image inserted inline')
    expect(richTextSource).toContain('reader.readAsDataURL(img)')
    expect(richTextSource).toContain("this.quill.insertEmbed(index, 'image', base64")
    expect(richTextSource).not.toContain('paste image redirected to node image')
    expect(richTextSource).not.toContain("this.mindMap.renderer.paste({ text: '', img })")
  })

  it('markdownStorage inlineToMarkdown uses src directly without data-smm-original-src', () => {
    const storageSource = read(markdownStoragePath)

    expect(storageSource).not.toContain('data-smm-original-src')
    expect(storageSource).toContain("node.getAttribute('src')")
    expect(storageSource).toContain("node.getAttribute('alt')")
  })

  it('saves Markdown nodes with a regenerated render cache instead of edit-layer HTML', () => {
    const richTextSource = read(richTextPath)

    expect(richTextSource).toContain('createMarkdownRenderCache')
    expect(richTextSource).toContain('const renderHtml =')
    expect(richTextSource).toContain('renderHtml: summarizeHtml(renderHtml)')
    expect(richTextSource).toContain('html: renderHtml')
  })

  it('logs the rich text blank-state data flow for second-click debugging', () => {
    const richTextSource = read(richTextPath)
    const storageSource = read(markdownStoragePath)
    const renderSource = read(path.join(__dirname, '../core/render/Render.js'))
    const debugSource = read(path.join(__dirname, '../utils/mindMapDebug.js'))

    expect(debugSource).toContain('imageCount')
    expect(debugSource).toContain('imageWithSrcCount')
    expect(storageSource).toContain('resolveMarkdownNodeHtml decision')
    expect(richTextSource).toContain('showEditText assigned edit html')
    expect(richTextSource).toContain('showEditText after initQuill')
    expect(richTextSource).toContain('editLayerHtml')
    expect(richTextSource).toContain('realtimeHtml')
    expect(renderSource).toContain('onNodeTextEditChange measured')
  })

  it('resolveMarkdownNodeHtml no longer checks isUnsafeEditCache', () => {
    const source = read(markdownStoragePath)
    expect(source).not.toContain('isUnsafeEditCache')
  })

  it('non-markdown paste creates node with markdown field when richText is enabled', () => {
    const source = read(path.join(__dirname, '../core/render/Render.js'))
    expect(source).toContain("nodeData.markdown = text")
  })
})

describe('dataModel', () => {
  const dataModelPath = path.join(__dirname, 'markdown/dataModel.js')

  it('ensureMarkdownField adds markdown from HTML for richText nodes', () => {
    const source = read(dataModelPath)
    expect(source).toContain('ensureMarkdownField')
    expect(source).toContain("data.richText && typeof data.markdown !== 'string' && typeof data.text === 'string'")
    expect(source).toContain("data.markdown = htmlToMarkdown(data.text)")
  })

  it('does not modify nodes that already have markdown', () => {
    const source = read(dataModelPath)
    expect(source).toContain("typeof data.markdown !== 'string'")
  })

  it('validateNodeData catches missing markdown', () => {
    const source = read(dataModelPath)
    expect(source).toContain('validateNodeData')
    expect(source).toContain("'richText node missing markdown field'")
    expect(source).toContain("'markdown present but text cache missing'")
  })

  it('migrateNodeData returns a new object', () => {
    const source = read(dataModelPath)
    expect(source).toContain('migrateNodeData')
    expect(source).toContain('const migrated = { ...data }')
    expect(source).toContain('ensureMarkdownField(migrated)')
  })
})

describe('Image conversion commands', () => {
  const renderPath = path.join(__dirname, '../core/render/Render.js')

  it('registers CONVERT_NODE_IMAGE_TO_INLINE command', () => {
    const source = read(renderPath)
    expect(source).toContain('CONVERT_NODE_IMAGE_TO_INLINE')
    expect(source).toContain('this.convertNodeImageToInline')
  })

  it('registers CONVERT_INLINE_IMAGE_TO_NODE command', () => {
    const source = read(renderPath)
    expect(source).toContain('CONVERT_INLINE_IMAGE_TO_NODE')
    expect(source).toContain('this.convertInlineImageToNode')
  })

  it('convertNodeImageToInline appends image Markdown and clears node-level image', () => {
    const source = read(renderPath)
    expect(source).toContain('convertNodeImageToInline(node)')
    expect(source).toContain("node.getData('image')")
    expect(source).toContain("node.getData('imageTitle')")
    expect(source).toContain("image: ''")
    expect(source).toContain("imageTitle: ''")
    expect(source).toContain('imageSize: { width: 0, height: 0 }')
  })

  it('convertInlineImageToNode extracts first inline image to node-level image', () => {
    const source = read(renderPath)
    expect(source).toContain('convertInlineImageToNode(node)')
    expect(source).toContain('imgRegex')
    expect(source).toContain('image: src')
    expect(source).toContain("imageTitle: alt || ''")
  })
})
