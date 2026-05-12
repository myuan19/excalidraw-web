import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('Render clipboard paste', () => {
  it('passes paste event clipboard data to paste()', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Render.js'), 'utf8')

    expect(source).toMatch(/this\.paste\(\{\s*text,\s*img\s*\}\)/)
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
