<template>
  <div
    class="editContainer"
    :style="mindMapLayerCssVars"
    @dragenter.stop.prevent="onDragenter"
    @dragleave.stop.prevent
    @dragover.stop.prevent
    @drop.stop.prevent
  >
    <div
      class="mindMapContainer"
      id="mindMapContainer"
      ref="mindMapContainer"
    ></div>
    <Toolbar v-if="!isZenMode && !isEmbedMode"></Toolbar>
    <Count :mindMap="mindMap" v-if="!isZenMode && !isEmbedMode"></Count>
    <Navigator v-if="mindMap" :mindMap="mindMap"></Navigator>
    <NavigatorToolbar
      :mindMap="mindMap"
      v-if="!isZenMode && !isEmbedMode"
    ></NavigatorToolbar>
    <OutlineSidebar
      v-if="
        mindMap && !isEmbedMode && mountedSidebars.outline && !isOutlineEdit
      "
      :mindMap="mindMap"
    ></OutlineSidebar>
    <Style
      v-if="mindMap && !isZenMode && !isEmbedMode && mountedSidebars.nodeStyle"
      :mindMap="mindMap"
    ></Style>
    <BaseStyle
      v-if="mindMap && !isEmbedMode && mountedSidebars.baseStyle"
      :data="mindMapData"
      :configData="mindMapConfig"
      :mindMap="mindMap"
    ></BaseStyle>
    <AssociativeLineStyle
      v-if="mindMap && !isEmbedMode"
      :mindMap="mindMap"
    ></AssociativeLineStyle>
    <Theme
      v-if="mindMap && !isEmbedMode && mountedSidebars.theme"
      :data="mindMapData"
      :mindMap="mindMap"
    ></Theme>
    <Structure
      v-if="mindMap && !isEmbedMode && mountedSidebars.structure"
      :mindMap="mindMap"
    ></Structure>
    <ShortcutKey
      v-if="!isEmbedMode && activeSidebar === 'shortcutKey'"
    ></ShortcutKey>
    <Contextmenu v-if="mindMap && !isEmbedMode" :mindMap="mindMap"></Contextmenu>
    <div
      ref="mindMapOverlayRoot"
      :class="MINDMAP_OVERLAY_ROOT_CLASS"
    ></div>
    <NodeImgPreview
      v-if="mindMap && !isEmbedMode"
      :mindMap="mindMap"
    ></NodeImgPreview>
    <SidebarTrigger v-if="!isZenMode && !isEmbedMode"></SidebarTrigger>
    <Search v-if="mindMap && !isEmbedMode" :mindMap="mindMap"></Search>
    <NodeIconSidebar
      v-if="mindMap && !isEmbedMode && activeSidebar === 'nodeIconSidebar'"
      :mindMap="mindMap"
    ></NodeIconSidebar>
    <NodeIconToolbar
      v-if="mindMap && !isEmbedMode"
      :mindMap="mindMap"
    ></NodeIconToolbar>
    <OutlineEdit v-if="mindMap && !isEmbedMode" :mindMap="mindMap"></OutlineEdit>
    <Scrollbar
      v-if="isShowScrollbar && mindMap && !isEmbedMode"
      :mindMap="mindMap"
    ></Scrollbar>
    <FormulaSidebar
      v-if="mindMap && !isEmbedMode && activeSidebar === 'formulaSidebar'"
      :mindMap="mindMap"
    ></FormulaSidebar>
    <NodeOuterFrame
      v-if="mindMap && !isEmbedMode"
      :mindMap="mindMap"
    ></NodeOuterFrame>
    <NodeTagStyle
      v-if="mindMap && !isEmbedMode"
      :mindMap="mindMap"
    ></NodeTagStyle>
    <Setting
      v-if="mindMap && !isEmbedMode && activeSidebar === 'setting'"
      :configData="mindMapConfig"
      :mindMap="mindMap"
    ></Setting>
    <!-- NodeImgPlacementToolbar removed: image placement is now adjusted by dragging -->
    <TextFormatSidebar
      v-if="mindMap && !isEmbedMode && activeSidebar === 'textFormat'"
      :mindMap="mindMap"
    ></TextFormatSidebar>
    <RichTextToolbar
      v-if="mindMap && !isEmbedMode"
      :mindMap="mindMap"
    ></RichTextToolbar>
    <AiSidebar
      v-if="mindMap && enableAi && !isEmbedMode && mountedSidebars.ai"
      :mindMap="mindMap"
    ></AiSidebar>
    <AiCreate
      v-if="mindMap && enableAi && !isEmbedMode"
      :mindMap="mindMap"
    ></AiCreate>
    <div
      class="dragMask"
      v-if="showDragMask"
      @dragleave.stop.prevent="onDragleave"
      @dragover.stop.prevent
      @drop.stop.prevent="onDrop"
    >
      <div class="dragTip">{{ $t('edit.dragTip') }}</div>
    </div>
  </div>
</template>

<script>
import MindMap from 'simple-mind-map'
import MiniMap from 'simple-mind-map/src/plugins/MiniMap.js'
import Watermark from 'simple-mind-map/src/plugins/Watermark.js'
import KeyboardNavigation from 'simple-mind-map/src/plugins/KeyboardNavigation.js'
import ExportPDF from 'simple-mind-map/src/plugins/ExportPDF.js'
import ExportXMind from 'simple-mind-map/src/plugins/ExportXMind.js'
import Export from 'simple-mind-map/src/plugins/Export.js'
import Drag from 'simple-mind-map/src/plugins/Drag.js'
import Select from 'simple-mind-map/src/plugins/Select.js'
import RichText from 'simple-mind-map/src/plugins/RichText.js'
import AssociativeLine from 'simple-mind-map/src/plugins/AssociativeLine.js'
import TouchEvent from 'simple-mind-map/src/plugins/TouchEvent.js'
import NodeImgAdjust from 'simple-mind-map/src/plugins/NodeImgAdjust.js'
import NodeImgSelect from 'simple-mind-map/src/plugins/NodeImgSelect.js'
import SearchPlugin from 'simple-mind-map/src/plugins/Search.js'
import Painter from 'simple-mind-map/src/plugins/Painter.js'
import ScrollbarPlugin from 'simple-mind-map/src/plugins/Scrollbar.js'
import Formula from 'simple-mind-map/src/plugins/Formula.js'
import RainbowLines from 'simple-mind-map/src/plugins/RainbowLines.js'
import Demonstrate from 'simple-mind-map/src/plugins/Demonstrate.js'
import OuterFrame from 'simple-mind-map/src/plugins/OuterFrame.js'
import MindMapLayoutPro from 'simple-mind-map/src/plugins/MindMapLayoutPro.js'
import NodeBase64ImageStorage from 'simple-mind-map/src/plugins/NodeBase64ImageStorage.js'
import Themes from 'simple-mind-map-plugin-themes'
// 协同编辑插件
// import Cooperate from 'simple-mind-map/src/plugins/Cooperate.js'
import Toolbar from './Toolbar.vue'
import Count from './Count.vue'
import NavigatorToolbar from './NavigatorToolbar.vue'
import Contextmenu from './Contextmenu.vue'
import RichTextToolbar from './RichTextToolbar.vue'
import { getData, getConfig, storeData, storeConfig } from '@/api'
import { isHostMode, requestSave } from '@/utils/hostBridge'
import Navigator from './Navigator.vue'
import NodeImgPreview from './NodeImgPreview.vue'
import SidebarTrigger from './SidebarTrigger.vue'
import { mapState } from 'vuex'
import Vue from 'vue'
import Search from './Search.vue'
import NodeIconToolbar from './NodeIconToolbar.vue'
import OutlineEdit from './OutlineEdit.vue'
import { showLoading, hideLoading } from '@/utils/loading'
import handleClipboardText from '@/utils/handleClipboardText'
import { getParentWithClass } from '@/utils'
import Scrollbar from './Scrollbar.vue'
import exampleData from 'simple-mind-map/example/exampleData'
import NodeOuterFrame from './NodeOuterFrame.vue'
import NodeTagStyle from './NodeTagStyle.vue'
import AssociativeLineStyle from './AssociativeLineStyle.vue'
// NodeImgPlacementToolbar removed: image placement adjusted by dragging
import AiCreate from './AiCreate.vue'
import previewViewportConfig from '../../../../../previewViewportConfig.json'
import {
  buildMindMapCanvasFocusedViewBoxOptions,
  computeMindMapFocusedViewBoxFromNodeBounds,
  filterMindMapFocusedNodeBounds
} from '../../../../../../mindMapFocusedViewBox.js'

import { isMindmapDevDebugEnabled, mindmapDevDebug } from '@/utils/mindmapDevDebug'
import { sidebarDebug, sidebarDebugBus, sidebarMemoryDebug } from '@/utils/sidebarDebug'
import {
  getMindMapLayerCssVars,
  getMindMapRuntimeOverlayOptions,
  MINDMAP_OVERLAY_ROOT_CLASS
} from '@/utils/mindMapEditorLayers'
import { createMindMapShortcutEnableCheck } from '@/utils/mindMapShortcut'
import { editHistoryDebug } from '@/utils/editHistoryDebug'
import {
  compactCustomThemeConfig,
  getMindMapTreeFingerprint,
  normalizeMindMapTreeRoot
} from '@/utils/editHistory'
import {
  mindmapLoadMark,
  mindmapLoadSummary,
  resetMindmapLoadTimeline
} from '@/utils/mindmapLoadTimeline'
import { nodeIconList as builtInNodeIconList } from 'simple-mind-map/src/svg/icons'

const debugMindMapOpen = (label, data = {}) => {
  mindmapDevDebug('vue Edit', label, data)
}

const OutlineSidebar = () => import('./OutlineSidebar.vue')
const Style = () => import('./Style.vue')
const BaseStyle = () => import('./BaseStyle.vue')
const Theme = () => import('./Theme.vue')
const Structure = () => import('./Structure.vue')
const ShortcutKey = () => import('./ShortcutKey.vue')
const FormulaSidebar = () => import('./FormulaSidebar.vue')
const Setting = () => import('./Setting.vue')
const NodeIconSidebar = () => import('./NodeIconSidebar.vue')
const TextFormatSidebar = () => import('./TextFormatSidebar.vue')
const AiSidebar = () => import('./AiSidebar.vue')

const builtInNodeIconTypes = new Set(builtInNodeIconList.map(item => item.type))

function walkMindMapNodeData(node, visit) {
  if (!node) return
  visit(node)
  const children = Array.isArray(node.children) ? node.children : []
  children.forEach(child => walkMindMapNodeData(child, visit))
}

function hasExtendedNodeIcon(root) {
  let found = false
  walkMindMapNodeData(root, node => {
    if (found) return
    const icons = node && node.data && Array.isArray(node.data.icon)
      ? node.data.icon
      : []
    found = icons.some(iconName => {
      const type = String(iconName || '').split('_')[0]
      return !!type && !builtInNodeIconTypes.has(type)
    })
  })
  return found
}

async function loadExtendedNodeIconsIfNeeded(root) {
  if (!hasExtendedNodeIcon(root)) {
    return []
  }
  const mod = await import('@/config/icon')
  return mod.default || []
}

const getSlowMindMapResources = () => {
  if (!isMindmapDevDebugEnabled() || !performance.getEntriesByType) return []
  return performance
    .getEntriesByType('resource')
    .filter(item => /\/mind-map\/|\/dist\//.test(item.name))
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 12)
    .map(item => ({
      name: item.name.split('/').slice(-2).join('/'),
      duration: Math.round(item.duration),
      transferSize: item.transferSize || 0,
      encodedBodySize: item.encodedBodySize || 0
    }))
}

// 注册插件
MindMap.usePlugin(MiniMap)
  .usePlugin(Watermark)
  .usePlugin(Drag)
  .usePlugin(KeyboardNavigation)
  .usePlugin(ExportPDF)
  .usePlugin(ExportXMind)
  .usePlugin(Export)
  .usePlugin(Select)
  .usePlugin(AssociativeLine)
  .usePlugin(NodeImgAdjust)
  .usePlugin(NodeImgSelect)
  .usePlugin(TouchEvent)
  .usePlugin(SearchPlugin)
  .usePlugin(Painter)
  .usePlugin(Formula)
  .usePlugin(RainbowLines)
  .usePlugin(Demonstrate)
  .usePlugin(OuterFrame)
  .usePlugin(MindMapLayoutPro)
  .usePlugin(NodeBase64ImageStorage)
// .usePlugin(Cooperate) // 协同插件

// 注册主题
Themes.init(MindMap)
// 扩展主题列表
if (typeof MoreThemes !== 'undefined') {
  MoreThemes.init(MindMap)
}

export default {
  components: {
    Toolbar,
    OutlineSidebar,
    Style,
    BaseStyle,
    Theme,
    Structure,
    Count,
    NavigatorToolbar,
    ShortcutKey,
    Contextmenu,
    RichTextToolbar,
    Navigator,
    NodeImgPreview,
    SidebarTrigger,
    Search,
    NodeIconSidebar,
    NodeIconToolbar,
    OutlineEdit,
    Scrollbar,
    FormulaSidebar,
    NodeOuterFrame,
    NodeTagStyle,
    Setting,
    AssociativeLineStyle,
    AiCreate,
    TextFormatSidebar,
    AiSidebar
  },
  data() {
    return {
      mindMapLayerCssVars: getMindMapLayerCssVars(),
      MINDMAP_OVERLAY_ROOT_CLASS,
      enableShowLoading: true,
      mindMap: null,
      mindMapData: null,
      mindMapConfig: {},
      prevImg: '',
      storeConfigTimer: null,
      showDragMask: false,
      embedPreviewInitialApplied: false,
      editorPreviewInitialApplied: false,
      awaitingPostViewportRender: false,
      hadInitialView: false,
      isEmbedMode: window.takeOverAppEmbedMode === true,
      mountedSidebars: {}
    }
  },
  computed: {
    ...mapState({
      isZenMode: state => state.localConfig.isZenMode,
      openNodeRichText: state => state.localConfig.openNodeRichText,
      isShowScrollbar: state => state.localConfig.isShowScrollbar,
      enableDragImport: state => state.localConfig.enableDragImport,
      useLeftKeySelectionRightKeyDrag: state =>
        state.localConfig.useLeftKeySelectionRightKeyDrag,
      extraTextOnExport: state => state.extraTextOnExport,
      isDragOutlineTreeNode: state => state.isDragOutlineTreeNode,
      activeSidebar: state => state.activeSidebar,
      isOutlineEdit: state => state.isOutlineEdit,
      enableAi: state => state.localConfig.enableAi
    })
  },
  watch: {
    activeSidebar: {
      immediate: true,
      handler(val, oldVal) {
        if (val) {
          this.$set(this.mountedSidebars, val, true)
        }
        sidebarDebug('Edit activeSidebar changed', {
          from: oldVal || null,
          to: val || null
        })
        sidebarMemoryDebug('activeSidebar switch', {
          from: oldVal || null,
          to: val || null
        })
      }
    },
    openNodeRichText() {
      if (this.openNodeRichText) {
        this.addRichTextPlugin()
      } else {
        this.removeRichTextPlugin()
      }
    },
    isShowScrollbar() {
      if (this.isShowScrollbar) {
        this.addScrollbarPlugin()
      } else {
        this.removeScrollbarPlugin()
      }
    }
  },
  created() {
    sidebarDebug('Edit created', {
      activeSidebar: this.activeSidebar || null
    })
    this.$bus.$on('closeSideBar', this.onDebugCloseSideBar)
  },
  mounted() {
    resetMindmapLoadTimeline('Edit mounted')
    mindmapLoadMark('vue Edit mounted start')
    debugMindMapOpen('mounted start')
    showLoading('Edit-mounted')
    this.getData()
    this.$bus.$on('node_tree_render_end', this.handleHideLoading)
    this.init()
    this.$bus.$on('execCommand', this.execCommand)
    this.$bus.$on('toolbarCanvasAction', this.handleToolbarCanvasAction)
    this.$bus.$on('paddingChange', this.onPaddingChange)
    this.$bus.$on('export', this.export)
    this.$bus.$on('setData', this.setData)
    this.$bus.$on('syncTreeData', this.syncTreeData)
    this.$bus.$on('startTextEdit', this.handleStartTextEdit)
    this.$bus.$on('endTextEdit', this.handleEndTextEdit)
    this.$bus.$on('createAssociativeLine', this.handleCreateLineFromActiveNode)
    this.$bus.$on('startPainter', this.handleStartPainter)
    this.$bus.$on('host_restore_preview_view', this.handleHostRestorePreviewView)
    this.$bus.$on('showLoading', this.handleShowLoading)
    this.$bus.$on('localStorageExceeded', this.onLocalStorageExceeded)
    window.addEventListener('resize', this.handleResize)
    debugMindMapOpen('mounted end')
  },
  beforeDestroy() {
    this.$bus.$off('closeSideBar', this.onDebugCloseSideBar)
    this.$bus.$off('execCommand', this.execCommand)
    this.$bus.$off('toolbarCanvasAction', this.handleToolbarCanvasAction)
    this.$bus.$off('paddingChange', this.onPaddingChange)
    this.$bus.$off('export', this.export)
    this.$bus.$off('setData', this.setData)
    this.$bus.$off('syncTreeData', this.syncTreeData)
    this.$bus.$off('startTextEdit', this.handleStartTextEdit)
    this.$bus.$off('endTextEdit', this.handleEndTextEdit)
    this.$bus.$off('createAssociativeLine', this.handleCreateLineFromActiveNode)
    this.$bus.$off('startPainter', this.handleStartPainter)
    this.$bus.$off('node_tree_render_end', this.handleHideLoading)
    this.$bus.$off('host_restore_preview_view', this.handleHostRestorePreviewView)
    this.$bus.$off('showLoading', this.handleShowLoading)
    this.$bus.$off('localStorageExceeded', this.onLocalStorageExceeded)
    window.removeEventListener('resize', this.handleResize)
    this.mindMap.destroy()
  },
  methods: {
    onDebugCloseSideBar(targetKey) {
      sidebarDebugBus('closeSideBar received', {
        targetKey: targetKey || null,
        activeSidebar: this.activeSidebar || null
      })
      sidebarMemoryDebug('closeSideBar bus', {
        targetKey: targetKey || null
      })
    },

    onLocalStorageExceeded() {
      this.$notify({
        type: 'warning',
        title: this.$t('edit.tip'),
        message: this.$t('edit.localStorageExceededTip'),
        duration: 0
      })
    },

    handleStartTextEdit() {
      this.mindMap.renderer.startTextEdit()
    },

    handleEndTextEdit() {
      this.mindMap.renderer.endTextEdit()
    },

    handleCreateLineFromActiveNode() {
      this.mindMap.associativeLine.createLineFromActiveNode()
    },

    handleStartPainter() {
      this.mindMap.painter.startPainter()
    },

    handleResize() {
      // 容器尺寸变化只同步画布大小、不重算视口（与 Excalidraw 嵌入一致），
      // 重新定位仅由定位按钮触发（applyEmbedFocusedViewport 按当前尺寸现算）
      this.mindMap.resize()
    },

    // 显示loading
    handleShowLoading() {
      this.enableShowLoading = true
      showLoading('bus-showLoading')
    },

    // 渲染结束后关闭loading
    handleHideLoading() {
      mindmapLoadMark('vue Edit node_tree_render_end hide loading', {
        enableShowLoading: this.enableShowLoading
      })
      debugMindMapOpen('node_tree_render_end hide loading', {
        enableShowLoading: this.enableShowLoading,
        awaitingPostViewportRender: this.awaitingPostViewportRender,
        slowResources: getSlowMindMapResources()
      })
      const hideCurrentLoading = () => {
        if (this.enableShowLoading) {
          this.enableShowLoading = false
          hideLoading('node_tree_render_end')
          debugMindMapOpen('node_tree_render_end loading hidden')
        }
      }
      if (this.awaitingPostViewportRender) {
        this.awaitingPostViewportRender = false
        hideCurrentLoading()
        return
      }
      if (this.isEmbedMode && !this.embedPreviewInitialApplied) {
        this.$nextTick(() => {
          this.tryRevealEmbedAfterInitialViewport(hideCurrentLoading)
        })
        return
      }
      if (
        window.takeOverApp &&
        !this.isEmbedMode &&
        !this.hadInitialView &&
        !this.editorPreviewInitialApplied
      ) {
        this.$nextTick(() => {
          this.tryRevealEditorAfterInitialViewport(hideCurrentLoading)
        })
        return
      }
      hideCurrentLoading()
    },

    tryRevealEmbedAfterInitialViewport(hideCurrentLoading, attempt = 0) {
      const result = this.applyEmbedFocusedViewport('initial-render-end')
      if (result && result.ok) {
        this.embedPreviewInitialApplied = true
        if (result.resizeTriggeredRender) {
          this.awaitingPostViewportRender = true
          return
        }
        hideCurrentLoading()
        return
      }
      if (attempt < 12) {
        requestAnimationFrame(() => {
          this.tryRevealEmbedAfterInitialViewport(hideCurrentLoading, attempt + 1)
        })
        return
      }
      hideCurrentLoading()
    },

    tryRevealEditorAfterInitialViewport(hideCurrentLoading, attempt = 0) {
      const result = this.applyEditorFocusedViewport('editor-initial-render-end')
      if (result && result.ok) {
        this.editorPreviewInitialApplied = true
        if (result.resizeTriggeredRender) {
          this.awaitingPostViewportRender = true
          return
        }
        hideCurrentLoading()
        return
      }
      if (attempt < 12) {
        requestAnimationFrame(() => {
          this.tryRevealEditorAfterInitialViewport(hideCurrentLoading, attempt + 1)
        })
        return
      }
      hideCurrentLoading()
    },

    // 获取思维导图数据，实际应该调接口获取
    getData() {
      const start = performance.now()
      this.mindMapData = getData()
      this.mindMapConfig = getConfig() || {}
      debugMindMapOpen('getData end', {
        elapsed: Math.round(performance.now() - start),
        hasData: !!this.mindMapData,
        rootChildren:
          this.mindMapData &&
          this.mindMapData.root &&
          this.mindMapData.root.children
            ? this.mindMapData.root.children.length
            : 0,
        configKeys: Object.keys(this.mindMapConfig || {}).length
      })
    },

    findMindMapPersistSampleText(root) {
      let sample = ''
      const walk = node => {
        if (sample || !node || !node.data) {
          return
        }
        const text = String(node.data.text || '')
        if (text.includes('<strong') || text.includes('ql-indent-')) {
          sample = text
          return
        }
        const children = Array.isArray(node.children) ? node.children : []
        children.forEach(walk)
      }
      walk(root)
      if (!sample && root && root.data) {
        sample = String(root.data.text || '')
      }
      return sample
    },

    // 存储数据当数据有变时
    bindSaveEvent() {
      this.$bus.$on('data_change', data => {
        const root = normalizeMindMapTreeRoot(data)
        if (!root) {
          return
        }
        const hasField = key =>
          data && Object.prototype.hasOwnProperty.call(data, key)
        editHistoryDebug('bindSaveEvent data_change', {
          hasTheme: hasField('theme'),
          hasThemeConfig: hasField('themeConfig')
        })
        const payload = { root }
        if (hasField('theme') || hasField('themeConfig')) {
          const template = hasField('theme') ? data.theme : this.mindMap.getTheme()
          const config = hasField('themeConfig')
            ? data.themeConfig
            : this.mindMap.getCustomThemeConfig()
          payload.theme = {
            template,
            config: compactCustomThemeConfig(config || {}, template)
          }
        }
        if (hasField('layout')) {
          payload.layout = data.layout
        }
        this.mindMapData = {
          ...(this.mindMapData || {}),
          ...payload
        }
        const sampleText = this.findMindMapPersistSampleText(root)
        mindmapDevDebug('mindmap-persist', 'bindSaveEvent storeData', {
          rootChildren: root.children ? root.children.length : 0,
          sampleTextLen: sampleText.length,
          sampleStrongCount: (sampleText.match(/<strong\b/gi) || []).length,
          samplePreview: sampleText.slice(0, 120)
        })
        storeData(payload)
        const configPatch = {}
        ;['outerFramePaddingX', 'outerFramePaddingY'].forEach(key => {
          if (hasField(key)) {
            configPatch[key] = data[key]
          }
        })
        if (hasField('rainbowLinesConfig')) {
          configPatch.rainbowLinesConfig = data.rainbowLinesConfig
        }
        if (Object.keys(configPatch).length > 0) {
          this.mindMapConfig = {
            ...(this.mindMapConfig || {}),
            ...configPatch
          }
          storeConfig(this.mindMapConfig)
        }
      })
      this.$bus.$on('back_forward', (index, length) => {
        editHistoryDebug('back_forward bus', { index, length })
      })
      this.$bus.$on('view_data_change', data => {
        if (window.takeOverApp) {
          return
        }
        clearTimeout(this.storeConfigTimer)
        this.storeConfigTimer = setTimeout(() => {
          storeData({
            view: data
          })
        }, 300)
      })
    },

    // 手动保存
    manualSave() {
      if (isHostMode()) {
        requestSave()
        return
      }
      storeData(this.mindMap.getData(true))
    },

    // 初始化
    async init() {
      const initStart = performance.now()
      mindmapLoadMark('vue Edit init start')
      debugMindMapOpen('init start')
      let hasFileURL = this.hasFileURL()
      let { root, layout, theme, view } = this.mindMapData
      const config = this.mindMapConfig
      // 如果url中存在要打开的文件，那么思维导图数据、主题、布局都使用默认的
      if (hasFileURL) {
        root = {
          data: {
            text: this.$t('edit.root')
          },
          children: []
        }
        layout = exampleData.layout
        theme = exampleData.theme
        view = null
      }
      const themeTemplate =
        theme && theme.template ? theme.template : exampleData.theme.template
      theme = {
        template: themeTemplate,
        config: compactCustomThemeConfig((theme && theme.config) || {}, themeTemplate)
      }
      this.mindMapData = {
        ...(this.mindMapData || {}),
        theme
      }
      const embedFit = window.takeOverAppEmbedMode === true
      if (embedFit) {
        view = null
      }
      this.hadInitialView = !!view
      // Layout root at center; framing offset comes from focused viewBox (same as editor/thumbnail).
      const initRootNodePosition = ['center', 'center']
      const extendedIconLoadStart = performance.now()
      const extendedIconList = await loadExtendedNodeIconsIfNeeded(root)
      if (extendedIconList.length > 0) {
        debugMindMapOpen('extended node icons loaded for initial data', {
          elapsed: Math.round(performance.now() - extendedIconLoadStart),
          groupCount: extendedIconList.length
        })
      }
      this.syncInitialOptionalPlugins()
      const newMindMapStart = performance.now()
      this.mindMap = new MindMap({
        el: this.$refs.mindMapContainer,
        data: root,
        fit: false,
        layout: layout,
        theme: theme.template,
        themeConfig: theme.config,
        viewData: view,
        ...getMindMapRuntimeOverlayOptions(this.$refs.mindMapOverlayRoot),
        openRealtimeRenderOnNodeTextEdit: true,
        enableAutoEnterTextEditWhenKeydown: true,
        demonstrateConfig: {
          openBlankMode: false
        },
        ...(config || {}),
        ...(embedFit
          ? {
              isLimitMindMapInCanvas: false,
              isLimitMindMapInCanvasWhenHasScrollbar: false
            }
          : {}),
        ...(extendedIconList.length > 0 ? { iconList: extendedIconList } : {}),
        useLeftKeySelectionRightKeyDrag: this.useLeftKeySelectionRightKeyDrag,
        enableShortcutOnlyWhenMouseInSvg: false,
        customCheckEnableShortcut: createMindMapShortcutEnableCheck(() => this.mindMap),
        handleTextEditSaveShortcut: () => {
          this.manualSave()
        },
        customHandleClipboardText: handleClipboardText,
        onlyPasteTextWhenHasImgAndText: false,
        defaultNodeImage: require('../../../assets/img/图片加载失败.svg'),
        initRootNodePosition: initRootNodePosition,
        errorHandler: (code, err) => {
          console.error(err)
          switch (code) {
            case 'export_error':
              this.$message.error(this.$t('edit.exportError'))
              break
            default:
              break
          }
        },
        addContentToFooter: () => {
          const text = this.extraTextOnExport.trim()
          if (!text) return null
          const el = document.createElement('div')
          el.className = 'footer'
          el.innerHTML = text
          const cssText = `
            .footer {
              width: 100%;
              height: 30px;
              display: flex;
              justify-content: center;
              align-items: center;
              font-size: 12px;
              color: #979797;
            }
          `
          return {
            el,
            cssText,
            height: 30
          }
        },
        expandBtnNumHandler: num => {
          return num >= 100 ? '…' : num
        },
        expandBtnHitExtend: 16,
        beforeDeleteNodeImg: node => {
          return new Promise(resolve => {
            this.$confirm(
              this.$t('edit.deleteNodeImgTip'),
              this.$t('edit.tip'),
              {
                confirmButtonText: this.$t('edit.yes'),
                cancelButtonText: this.$t('edit.no'),
                type: 'warning'
              }
            )
              .then(() => {
                resolve(false)
              })
              .catch(() => {
                resolve(true)
              })
          })
        }
      })
      mindmapLoadMark('vue Edit new MindMap end', {
        elapsed: Math.round(performance.now() - newMindMapStart)
      })
      debugMindMapOpen('new MindMap end', {
        elapsed: Math.round(performance.now() - newMindMapStart),
        rootChildren: root && root.children ? root.children.length : 0,
        layout,
        theme: theme && theme.template,
        hasView: !!view,
        embedFit,
        initRootNodePosition,
        configKeys: Object.keys(config || {}).length
      })
      if (
        window.takeOverAppReadOnly === true &&
        typeof this.mindMap.setMode === 'function'
      ) {
        this.mindMap.setMode('readonly')
        this.$bus.$emit('host_readonly_mode', true)
      }
      this.mindMap.keyCommand.addShortcut('Control+s', () => {
        this.manualSave()
      })
      this.mindMap.keyCommand.addShortcut('Meta+s', () => {
        this.manualSave()
      })
      // 转发事件
      ;[
        'node_active',
        'data_change',
        'view_data_change',
        'back_forward',
        'edit_history_restored',
        'node_contextmenu',
        'node_click',
        'draw_click',
        'expand_btn_click',
        'svg_mousedown',
        'mouseup',
        'mode_change',
        'node_tree_render_end',
        'rich_text_selection_change',
        'transforming-dom-to-images',
        'generalization_node_contextmenu',
        'painter_start',
        'painter_end',
        'scrollbar_change',
        'scale',
        'translate',
        'node_attachmentClick',
        'node_attachmentContextmenu',
        'demonstrate_jump',
        'exit_demonstrate',
        'node_note_click',
        'node_mousedown',
        'node_img_selected',
        'node_img_deselected',
        'node_img_contextmenu',
        'node_img_preview',
        'node_img_copied',
        'node_img_cut',
        'hide_text_edit'
      ].forEach(event => {
        this.mindMap.on(event, (...args) => {
          this.$bus.$emit(event, ...args)
        })
      })
      debugMindMapOpen('event forwarding bound')
      if (window.__mindMapSyncLayout) {
        debugMindMapOpen('sync layout: re-emit node_tree_render_end (missed during constructor)')
        this.$bus.$emit('node_tree_render_end')
      }
      this.bindSaveEvent()
      // 如果应用被接管，那么抛出事件传递思维导图实例
      if (window.takeOverApp) {
        if (this.isEmbedMode) {
          this.mindMap.__nbApplyHostViewport = (reason, options = {}) =>
            this.applyEmbedFocusedViewport(reason, options)
        }
        mindmapLoadMark('vue Edit emit app_inited', {
          totalElapsed: Math.round(performance.now() - initStart)
        })
        debugMindMapOpen('emit app_inited', {
          totalElapsed: Math.round(performance.now() - initStart)
        })
        this.$bus.$emit('app_inited', this.mindMap)
      }
      // 解析url中的文件
      if (hasFileURL) {
        this.$bus.$emit('handle_file_url')
      }
      // api/index.js文件使用
      // 当正在编辑本地文件时通过该方法获取最新数据
      Vue.prototype.getCurrentData = () => {
        const fullData = this.mindMap.getData(true)
        return { ...fullData }
      }
      // 协同测试
      this.cooperateTest()
      if (!this.isEmbedMode) {
        this.warmSidebarPanels()
      }
      mindmapLoadSummary('vue Edit init end', {
        totalElapsed: Math.round(performance.now() - initStart),
        slowResources: getSlowMindMapResources()
      })
      debugMindMapOpen('init end', {
        totalElapsed: Math.round(performance.now() - initStart),
        slowResources: getSlowMindMapResources()
      })
    },

    warmSidebarPanels() {
      const loaders = [
        import('./Style.vue'),
        import('./BaseStyle.vue'),
        import('./Theme.vue'),
        import('./Structure.vue')
      ]
      if (this.enableAi) {
        loaders.push(import('./AiSidebar.vue'))
      }
      const mountKeys = ['baseStyle', 'theme', 'structure']
      if (!this.isZenMode) {
        mountKeys.unshift('nodeStyle')
      }
      if (this.enableAi) {
        mountKeys.push('ai')
      }
      const run = () => {
        Promise.all(loaders).then(() => {
          mountKeys.forEach(key => {
            this.$set(this.mountedSidebars, key, true)
          })
          sidebarDebug('sidebar panels warmed', { keys: mountKeys })
        })
      }
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(run, { timeout: 2500 })
      } else {
        window.setTimeout(run, 200)
      }
    },

    syncInitialPlugin(plugin, enabled) {
      if (enabled) {
        MindMap.usePlugin(plugin)
      } else {
        MindMap.removePlugin(plugin)
      }
    },

    syncInitialOptionalPlugins() {
      this.syncInitialPlugin(RichText, this.openNodeRichText)
      this.syncInitialPlugin(ScrollbarPlugin, this.isShowScrollbar)
    },

    // url中是否存在要打开的文件
    hasFileURL() {
      const fileURL = this.$route.query.fileURL
      if (!fileURL) return false
      return /\.(smm|json|xmind|xlsx)$/.test(fileURL)
    },

    // 同步大纲等场景的树数据，保留当前画布视口
    syncTreeData(treeData) {
      if (!this.mindMap || !treeData) {
        return
      }
      const nextFp = JSON.stringify(normalizeMindMapTreeRoot(treeData))
      const currentFp = getMindMapTreeFingerprint(this.mindMap)
      if (nextFp === currentFp) {
        editHistoryDebug('syncTreeData skipped unchanged tree')
        return
      }
      this.mindMap.updateData(treeData, { preserveView: true })
      this.manualSave()
    },

    // 动态设置思维导图数据
    setData(data, options = {}) {
      const preserveView = !!(options && options.preserveView)
      if (!preserveView) {
        this.handleShowLoading()
      }
      let rootNodeData = null
      if (data.root) {
        this.mindMap.setFullData(data)
        rootNodeData = data.root
      } else {
        this.mindMap.setData(data)
        rootNodeData = data
      }
      if (!preserveView) {
        this.mindMap.view.reset()
      }
      this.manualSave()
      // 如果导入的是富文本内容，那么自动开启富文本模式
      if (rootNodeData.data.richText && !this.openNodeRichText) {
        this.$bus.$emit('toggleOpenNodeRichText', true)
        this.$notify.info({
          title: this.$t('edit.tip'),
          message: this.$t('edit.autoOpenNodeRichTextTip')
        })
      }
    },

    // 重新渲染
    reRender() {
      this.mindMap.reRender()
    },

    handleHostRestorePreviewView(payload = {}) {
      try {
        const reason = payload.reason || 'host-restore'
        const options = { requestId: payload.requestId || null }
        if (this.isEmbedMode) {
          return this.applyEmbedFocusedViewport(reason, options)
        }
        return this.applyEditorFocusedViewport(reason, options)
      } catch (error) {
        console.error('[mindmap] restore preview view failed', error)
        this.notifyEmbedPreviewViewportApplied({
          reason: payload.reason || 'host-restore',
          requestId: payload.requestId || null,
          ok: false,
          error: error && error.message ? error.message : String(error)
        })
        return { ok: false, applied: false }
      }
    },

    readEmbedLayoutViewport() {
      if (!this.mindMap || !this.mindMap.view) {
        return null
      }
      return {
        scale: this.mindMap.view.scale,
        x: this.mindMap.view.x,
        y: this.mindMap.view.y
      }
    },

    applyEmbedFocusedViewport(reason, options = {}) {
      const requestId = options.requestId || null
      if (!this.isEmbedMode || !this.mindMap || !this.mindMap.view) {
        this.notifyEmbedPreviewViewportApplied({
          reason,
          requestId,
          ok: false,
          error: 'embed-focused-viewport-unavailable'
        })
        return { ok: false, applied: false, reason }
      }
      debugMindMapOpen('applyEmbedFocusedViewport start', {
        reason,
        scaleBefore: this.mindMap.view.scale || null,
        rootPosition: this.mindMap.opt.initRootNodePosition || null
      })
      const resizeTriggeredRender = this.syncMindMapContainerSize()
      // 始终按当前容器尺寸现算视口（计算是"容器尺寸 + 节点 bounds"的确定性函数），
      // 容器变化后任何来源的定位（按钮/resize/初始化）都能得到正确的长宽比适配
      const viewBox = this.computeEmbedFocusedViewBox()
      if (!viewBox) {
        this.notifyEmbedPreviewViewportApplied({
          reason,
          requestId,
          ok: false,
          error: 'embed-focused-viewport-no-viewbox'
        })
        return { ok: false, applied: false, reason }
      }
      const applied = this.applyFocusedViewBox(viewBox)
      if (!applied) {
        this.notifyEmbedPreviewViewportApplied({
          reason,
          requestId,
          ok: false,
          error: 'embed-focused-viewport-not-applied'
        })
        return { ok: false, applied: false, reason }
      }
      const viewport = this.readEmbedLayoutViewport()
      if (!viewport) {
        this.notifyEmbedPreviewViewportApplied({
          reason,
          requestId,
          ok: false,
          error: 'embed-focused-viewport-read-failed'
        })
        return { ok: false, applied: false, reason }
      }
      debugMindMapOpen('applyEmbedFocusedViewport done', {
        reason,
        viewport
      })
      this.notifyEmbedPreviewViewportApplied({
        reason,
        requestId,
        ok: true,
        scale: viewport.scale,
        x: viewport.x,
        y: viewport.y
      })
      return {
        ok: true,
        applied: true,
        reason,
        scale: viewport.scale,
        x: viewport.x,
        y: viewport.y,
        resizeTriggeredRender
      }
    },

    syncMindMapContainerSize() {
      if (!this.mindMap || typeof this.mindMap.resize !== 'function') {
        return false
      }
      const oldWidth = this.mindMap.width
      const oldHeight = this.mindMap.height
      this.mindMap.resize()
      return this.mindMap.width !== oldWidth || this.mindMap.height !== oldHeight
    },

    notifyEmbedPreviewViewportApplied(payload) {
      if (!this.isEmbedMode || !window.takeOverApp) {
        return
      }
      this.$bus.$emit('embed_preview_viewport_applied', payload)
    },

    collectFocusedPreviewNodeBounds() {
      const root = this.mindMap && this.mindMap.renderer
        ? this.mindMap.renderer.root
        : null
      const bounds = []
      const walk = node => {
        if (!node) return
        const item = {
          x: Number(node.left),
          y: Number(node.top),
          width: Number(node.width),
          height: Number(node.height)
        }
        if (
          Number.isFinite(item.x) &&
          Number.isFinite(item.y) &&
          Number.isFinite(item.width) &&
          Number.isFinite(item.height) &&
          item.width > 0 &&
          item.height > 0
        ) {
          bounds.push(item)
        }
        ;(node.children || []).forEach(child => walk(child))
      }
      walk(root)
      return bounds
    },

    getConfiguredRootScreenRatioMultiplier() {
      const configuredMultiplier = Number(
        this.mindMapConfig &&
          this.mindMapConfig.__nbPreviewRootScreenRatioMultiplier
      )
      return Number.isFinite(configuredMultiplier) && configuredMultiplier > 0
        ? configuredMultiplier
        : null
    },

    isDocumentSingleRootOnly() {
      const data =
        this.mindMapData ||
        (this.mindMap && typeof this.mindMap.getData === 'function'
          ? this.mindMap.getData(true)
          : null)
      const root = data && data.root
      return !!(root && (!root.children || root.children.length === 0))
    },

    collectFocusedPreviewNodeBoundsForViewport() {
      const rawBounds = this.collectFocusedPreviewNodeBounds()
      return filterMindMapFocusedNodeBounds(
        rawBounds,
        this.isDocumentSingleRootOnly()
      )
    },

    computeEmbedFocusedViewBox() {
      const nodeBounds = this.collectFocusedPreviewNodeBoundsForViewport()
      return computeMindMapFocusedViewBoxFromNodeBounds(
        nodeBounds,
        buildMindMapCanvasFocusedViewBoxOptions(
          this.getConfiguredRootScreenRatioMultiplier(),
          'embed'
        )
      )
    },

    computeEditorFocusedViewBox() {
      const nodeBounds = this.collectFocusedPreviewNodeBoundsForViewport()
      return computeMindMapFocusedViewBoxFromNodeBounds(
        nodeBounds,
        buildMindMapCanvasFocusedViewBoxOptions(
          this.getConfiguredRootScreenRatioMultiplier(),
          'editor'
        )
      )
    },

    applyFocusedViewBox(viewBox) {
      if (!viewBox || !this.$refs.mindMapContainer) return null
      const rect = this.$refs.mindMapContainer.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      const scale = Math.min(rect.width / viewBox.width, rect.height / viewBox.height)
      const x = (rect.width - viewBox.width * scale) / 2 - viewBox.x * scale
      const y = (rect.height - viewBox.height * scale) / 2 - viewBox.y * scale
      this.mindMap.view.scale = scale
      this.mindMap.view.x = x
      this.mindMap.view.y = y
      this.mindMap.view.transform()
      if (typeof this.mindMap.view.emitEvent === 'function') {
        this.mindMap.view.emitEvent('scale')
      }
      return { scale, x, y }
    },

    applyEditorFocusedViewport(reason, options = {}) {
      const requestId = options.requestId || null
      const canApplyEditorFocusedViewport =
        !this.isEmbedMode && window.takeOverApp && !this.hadInitialView
      if (!canApplyEditorFocusedViewport || !this.mindMap || !this.mindMap.view) {
        debugMindMapOpen('applyEditorFocusedViewport skipped', {
          reason,
          isEmbedMode: this.isEmbedMode,
          hadInitialView: this.hadInitialView,
          canApplyEditorFocusedViewport,
          hasMindMap: !!this.mindMap,
          hasView: !!(this.mindMap && this.mindMap.view)
        })
        return { ok: false, applied: false, reason }
      }
      const scaleBefore = this.mindMap.view.scale || null
      const size = {
        w: this.$refs.mindMapContainer
          ? Math.round(this.$refs.mindMapContainer.getBoundingClientRect().width)
          : null,
        h: this.$refs.mindMapContainer
          ? Math.round(this.$refs.mindMapContainer.getBoundingClientRect().height)
          : null
      }
      debugMindMapOpen('applyEditorFocusedViewport start', {
        reason,
        scaleBefore,
        size,
        rootPosition: this.mindMap.opt.initRootNodePosition || null
      })
      const resizeTriggeredRender = this.syncMindMapContainerSize()
      const viewBox = this.computeEditorFocusedViewBox()
      if (!viewBox) {
        debugMindMapOpen('applyEditorFocusedViewport failed: no viewBox', {
          reason
        })
        return { ok: false, applied: false, reason }
      }
      const applied = this.applyFocusedViewBox(viewBox)
      const result = {
        ok: !!applied,
        applied: !!applied,
        reason,
        scale: applied ? this.mindMap.view.scale || null : null,
        x: applied ? this.mindMap.view.x : null,
        y: applied ? this.mindMap.view.y : null,
        viewBox,
        resizeTriggeredRender
      }
      debugMindMapOpen('applyEditorFocusedViewport done', {
        reason,
        scaleAfter: this.mindMap.view.scale || null,
        viewBox,
        applied: result.applied,
        resizeTriggeredRender
      })
      return result
    },

    // 执行命令
    execCommand(...args) {
      this.mindMap.execCommand(...args)
    },

    handleToolbarCanvasAction(action) {
      switch (action) {
        case 'expandAll':
          this.mindMap.execCommand('EXPAND_ALL')
          break
        case 'collapseAll':
          this.mindMap.execCommand('UNEXPAND_ALL', true)
          break
        case 'zoomOut':
          this.mindMap.view.narrow()
          break
        case 'zoomIn':
          this.mindMap.view.enlarge()
          break
        case 'fitCanvas':
          this.mindMap.view.fit()
          break
        default:
          break
      }
    },

    // 导出
    async export(...args) {
      try {
        showLoading()
        await this.mindMap.export(...args)
        hideLoading()
      } catch (error) {
        console.log(error)
        hideLoading()
      }
    },

    // 修改导出内边距
    onPaddingChange(data) {
      this.mindMap.updateConfig(data)
    },

    // 加载节点富文本编辑插件
    addRichTextPlugin() {
      if (!this.mindMap) return
      this.mindMap.addPlugin(RichText)
    },

    // 移除节点富文本编辑插件
    removeRichTextPlugin() {
      this.mindMap.removePlugin(RichText)
    },

    // 加载滚动条插件
    addScrollbarPlugin() {
      if (!this.mindMap) return
      this.mindMap.addPlugin(ScrollbarPlugin)
    },

    // 移除滚动条插件
    removeScrollbarPlugin() {
      this.mindMap.removePlugin(ScrollbarPlugin)
    },

    // 协同测试
    cooperateTest() {
      if (this.mindMap.cooperate && this.$route.query.userName) {
        this.mindMap.cooperate.setProvider(null, {
          roomName: 'demo-room',
          signalingList: ['ws://localhost:4444']
        })
        this.mindMap.cooperate.setUserInfo({
          id: Math.random(),
          name: this.$route.query.userName,
          color: ['#409EFF', '#67C23A', '#E6A23C', '#F56C6C', '#909399'][
            Math.floor(Math.random() * 5)
          ],
          avatar:
            Math.random() > 0.5
              ? 'https://img0.baidu.com/it/u=4270674549,2416627993&fm=253&app=138&size=w931&n=0&f=JPEG&fmt=auto?sec=1696006800&t=4d32871d14a7224a4591d0c3c7a97311'
              : ''
        })
      }
    },

    // 拖拽文件到页面导入
    onDragenter() {
      if (!this.enableDragImport || this.isDragOutlineTreeNode) return
      this.showDragMask = true
    },

    onDragleave() {
      this.showDragMask = false
    },

    onDrop(e) {
      if (!this.enableDragImport) return
      this.showDragMask = false
      const dt = e.dataTransfer
      const file = dt.files && dt.files[0]
      if (!file) return
      this.$bus.$emit('importFile', file)
    }
  }
}
</script>

<style lang="less" scoped>
.editContainer {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;

  .dragMask {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(255, 255, 255, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 3999;

    .dragTip {
      pointer-events: none;
      font-weight: bold;
    }
  }

  .mindMapContainer {
    position: absolute;
    left: 0px;
    top: 0px;
    width: 100%;
    height: 100%;
  }
}
</style>

<style lang="less">
@import '@/utils/mindMapEditorLayers.less';
</style>
