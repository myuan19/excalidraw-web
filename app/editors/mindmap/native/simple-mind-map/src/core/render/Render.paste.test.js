import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('Render clipboard paste', () => {
  it('keeps node click as selection-only and uses double click for editing', () => {
    const textEditSource = fs.readFileSync(
      path.join(__dirname, 'TextEdit.js'),
      'utf8'
    )
    const nodeSource = fs.readFileSync(
      path.join(__dirname, 'node/MindMapNode.js'),
      'utf8'
    )
    const clickHandler = nodeSource.match(
      /this\.group\.on\('click', e => \{[\s\S]*?\n    \}\)/
    )?.[0]
    const dblclickHandler = nodeSource.match(
      /this\.group\.on\('dblclick', e => \{[\s\S]*?\n    \}\)/
    )?.[0]

    expect(clickHandler).not.toContain("this.mindMap.emit('node_edit_request', this, e)")
    expect(clickHandler).toContain('this.active(e)')
    expect(dblclickHandler).toContain("this.mindMap.emit('node_dblclick', this, e)")
    expect(dblclickHandler).not.toContain('node_edit_request')
    expect(textEditSource).toContain("this.mindMap.on('node_dblclick'")
    expect(textEditSource).not.toContain('this.mindMap.view.translateXY(offsetLeft, offsetTop)')
    expect(textEditSource).toContain('viewBeforeEdit')
    expect(textEditSource).toContain('viewAfterEdit')
  })

  it('passes paste event clipboard data to paste()', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Render.js'), 'utf8')

    expect(source).toMatch(/this\.paste\(\{\s*text,\s*img\s*\}\)/)
  })

  it('does not split pasted rich text while the target is inside an editor', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Render.js'), 'utf8')

    expect(source).toContain('target.closest')
    expect(source).toContain('.smm-richtext-node-edit-wrap')
    expect(source).toContain("debugMindMap('mindmap-paste', 'return editor target')")
  })

  it('does not split multi-line Markdown paste into multiple nodes', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Render.js'), 'utf8')

    expect(source).toContain(
      "import { looksLikeMarkdown } from '../../plugins/markdown/markdownPaste'"
    )
    expect(source).toContain(
      "createMarkdownClipboardNodeData"
    )
    expect(source).toContain('const isMarkdownText = looksLikeMarkdown(text)')
    expect(source).toContain('createMarkdownClipboardNodeData(text)')
    expect(source).not.toContain('handleIsSplitByWrapOnPasteCreateNewNode')
    expect(source).not.toContain("split(new RegExp('\\r?\\n|(?<!\\n)\\r', 'g'))")
  })

  it('ignores stale rich text realtime renders after editing has ended', () => {
    const renderSource = fs.readFileSync(path.join(__dirname, 'Render.js'), 'utf8')
    const richTextSource = fs.readFileSync(
      path.join(__dirname, '../../plugins/RichText.js'),
      'utf8'
    )

    expect(richTextSource).toContain('shouldRealtimeRender: true')
    expect(richTextSource).toContain('if (isMarkdownNode) {')
    expect(renderSource).toContain('if (richText && !shouldRealtimeRender)')
    expect(renderSource).toContain('onNodeTextEditChange skipped: rich text event not realtime')
    expect(renderSource).toContain('if (richText && !this.textEdit.isShowTextEdit())')
    expect(renderSource).toContain('onNodeTextEditChange skipped: stale rich text event')
  })

  it('ignores blank intermediate rich text realtime renders while pasting Markdown', () => {
    const renderSource = fs.readFileSync(path.join(__dirname, 'Render.js'), 'utf8')

    expect(renderSource).toContain('if (richText && summarizeHtml(text).isBlank)')
    expect(renderSource).toContain('onNodeTextEditChange skipped: blank rich text event')
  })

  it('falls back to the host clipboard bridge when iframe clipboard read is empty', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../utils/index.js'),
      'utf8'
    )

    expect(source).toContain('if (text || img) {')
    expect(source).toMatch(
      /window\.takeOverAppMethods\?\.readClipboardItems[\s\S]*return\s+\{\s*text,\s*img\s*\}/
    )
  })

  it('pins the AI toolbar icon to a centered button style', () => {
    const nodeBtnSource = fs.readFileSync(
      path.join(
        __dirname,
        '../../../../web/src/pages/Edit/components/ToolbarNodeBtnList.vue'
      ),
      'utf8'
    )
    const toolbarSource = fs.readFileSync(
      path.join(
        __dirname,
        '../../../../web/src/pages/Edit/components/Toolbar.vue'
      ),
      'utf8'
    )

    expect(nodeBtnSource).toContain('class="toolbarBtn aiToolbarBtn"')
    expect(toolbarSource).toContain('class="toolbarBtn aiToolbarBtn"')
    expect(toolbarSource).toMatch(
      /\.aiToolbarBtn[\s\S]*?\.icon[\s\S]*?align-items:\s*center/
    )
  })

  it('fits the read-only embed viewport instead of reusing editor view data', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../../../web/src/pages/Edit/components/Edit.vue'),
      'utf8'
    )

    expect(source).toContain('const embedFit = window.takeOverAppEmbedMode === true')
    expect(source).toMatch(/if\s*\(embedFit\)\s*\{\s*view\s*=\s*null\s*\}/)
    expect(source).toContain('const embedRootPosition = embedFit')
    expect(source).toMatch(/initRootNodePosition:\s*embedRootPosition/)
    expect(source).toContain("this.applyEmbedPreviewViewport('initial-render-end')")
    expect(source).toContain('applyEmbedPreviewViewport(reason)')
    expect(source).toContain("import previewViewportConfig from '../../../../../previewViewportConfig.json'")
    expect(source).not.toContain('const EMBED_PREVIEW_BASELINE_ROOT_SCREEN_RATIO = 0.224')
    expect(source).toContain('EMBED_PREVIEW_ROOT_SCREEN_RATIO_MULTIPLIER')
    expect(source).toContain('previewViewportConfig.embedRootScreenRatioMultiplier')
    expect(source).toContain('__nbPreviewRootScreenRatioMultiplier')
    expect(source).toContain('const EMBED_PREVIEW_TARGET_ROOT_SCREEN_RATIO =')
    expect(source).toContain('EMBED_PREVIEW_BASELINE_ROOT_SCREEN_RATIO *')
    expect(source).toContain('EMBED_PREVIEW_ROOT_SCREEN_RATIO_MULTIPLIER')
    expect(source).toContain('computeEmbedPreviewViewBox()')
    expect(source).toContain('applyEmbedPreviewViewBox(viewBox)')
    const applyViewportBody = source.slice(
      source.indexOf('applyEmbedPreviewViewport(reason)'),
      source.indexOf('// 执行命令')
    )
    expect(applyViewportBody).not.toContain('this.mindMap.view.fit()')
  })

  it('registers the render-end loading handler before initializing the mind map', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../../../web/src/pages/Edit/components/Edit.vue'),
      'utf8'
    )
    const mountedBody = source.slice(
      source.indexOf('mounted() {'),
      source.indexOf('beforeDestroy() {')
    )

    const renderEndHandlerIndex = mountedBody.indexOf(
      "this.$bus.$on('node_tree_render_end', this.handleHideLoading)"
    )

    expect(renderEndHandlerIndex).toBeGreaterThan(-1)
    expect(renderEndHandlerIndex).toBeLessThan(mountedBody.indexOf('this.init()'))
  })

  it('keeps the embed loading mask until the initial preview viewport is applied', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../../../web/src/pages/Edit/components/Edit.vue'),
      'utf8'
    )
    const hideLoadingBody = source.slice(
      source.indexOf('handleHideLoading() {'),
      source.indexOf('// 获取思维导图数据')
    )
    const embedInitialBranchStart = hideLoadingBody.indexOf(
      'if (this.isEmbedMode && !this.embedPreviewInitialApplied)'
    )
    const embedInitialBranch = hideLoadingBody.slice(
      embedInitialBranchStart,
      hideLoadingBody.indexOf('return', embedInitialBranchStart)
    )

    const applyViewportIndex = embedInitialBranch.indexOf(
      "this.applyEmbedPreviewViewport('initial-render-end')"
    )
    const hideLoadingIndex = embedInitialBranch.indexOf('hideCurrentLoading()')

    expect(hideLoadingBody).toContain('hideLoading()')
    expect(applyViewportIndex).toBeGreaterThan(-1)
    expect(applyViewportIndex).toBeLessThan(hideLoadingIndex)
  })
})
