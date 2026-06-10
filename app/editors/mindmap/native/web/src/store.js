import Vue from 'vue'
import Vuex from 'vuex'
import { storeLocalConfig } from '@/api'
import { mindmapDevDebug } from '@/utils/mindmapDevDebug'
import { sidebarDebugSetActiveSidebar } from '@/utils/sidebarDebug'

Vue.use(Vuex)

const store = new Vuex.Store({
  state: {
    isHandleLocalFile: false, // 是否操作的是本地文件
    localConfig: {
      // 本地配置
      isZenMode: false, // 是否是禅模式
      // 是否开启节点富文本
      openNodeRichText: true,
      // 鼠标行为
      useLeftKeySelectionRightKeyDrag: false,
      // 是否显示滚动条
      isShowScrollbar: false,
      // 是否是暗黑模式
      isDark: false,
      // 是否开启AI功能
      enableAi: true,
      // 划选富文本时是否显示浮动工具栏
      showRichTextToolbarOnSelection: false
    },
    activeSidebar: '', // 当前显示的侧边栏
    previousActiveSidebar: '', // 上一个侧边栏（用于判断是否需要切换动画）
    isOutlineEdit: false, // 是否是大纲编辑模式
    isReadonly: false, // 是否只读
    isSourceCodeEdit: false, // 是否是源码编辑模式
    extraTextOnExport: '', // 导出时底部添加的文字
    isDragOutlineTreeNode: false, // 当前是否正在拖拽大纲树的节点
    aiConfig: {
      api: 'http://ark.cn-beijing.volces.com/api/v3/chat/completions',
      key: '',
      model: '',
      port: 3456,
      method: 'POST',
      transport: 'direct',
      configured: false
    },
    // 扩展主题列表
    extendThemeGroupList: [],
    // 内置背景图片
    bgList: []
  },
  mutations: {
    // 设置操作本地文件标志位
    setIsHandleLocalFile(state, data) {
      state.isHandleLocalFile = data
    },

    // 设置本地配置
    setLocalConfig(state, data) {
      const aiConfigKeys = Object.keys(state.aiConfig)
      mindmapDevDebug('mindmap-ai', 'store.setLocalConfig before', {
        incomingKeys: data && typeof data === 'object' ? Object.keys(data) : [],
        hasIncomingApi: !!(data && data.api),
        incomingApiTail: data && data.api ? String(data.api).slice(-32) : '',
        hasIncomingKey: !!(data && data.key),
        incomingKeyLen: data && data.key ? String(data.key).length : 0,
        incomingModel: data && data.model,
        currentHasApi: !!state.aiConfig.api,
        currentApiTail: state.aiConfig.api
          ? String(state.aiConfig.api).slice(-32)
          : '',
        currentHasKey: !!state.aiConfig.key,
        currentKeyLen: state.aiConfig.key ? state.aiConfig.key.length : 0,
        currentModel: state.aiConfig.model
      })
      Object.keys(data).forEach(key => {
        if (aiConfigKeys.includes(key)) {
          state.aiConfig[key] = data[key]
        } else {
          state.localConfig[key] = data[key]
        }
      })
      mindmapDevDebug('mindmap-ai', 'store.setLocalConfig after', {
        hasApi: !!state.aiConfig.api,
        apiTail: state.aiConfig.api ? String(state.aiConfig.api).slice(-32) : '',
        hasKey: !!state.aiConfig.key,
        keyLen: state.aiConfig.key ? state.aiConfig.key.length : 0,
        model: state.aiConfig.model,
        method: state.aiConfig.method,
        port: state.aiConfig.port
      })
      storeLocalConfig({
        ...state.localConfig,
        ...state.aiConfig
      })
    },

    // 使用宿主统一 AI 配置覆盖 MindMap 原生 AI 配置
    setHostAiConfig(state, data) {
      mindmapDevDebug('mindmap-ai', 'store.setHostAiConfig before', {
        hasData: !!data,
        configured: !!(data && data.configured),
        hasApi: !!(data && data.api),
        apiTail: data && data.api ? String(data.api).slice(-32) : '',
        keyLen: data && data.key ? data.key.length : 0,
        hasKey: !!(data && data.key),
        hasMethod: !!(data && data.method),
        model: data && data.model,
        transport: data && data.transport
      })
      if (!data || typeof data !== 'object') {
        mindmapDevDebug('mindmap-ai', 'store.setHostAiConfig ignored', {
          dataType: data === null ? 'null' : typeof data
        })
        return
      }
      state.aiConfig = {
        ...state.aiConfig,
        ...(data.api ? { api: data.api } : {}),
        ...(Object.prototype.hasOwnProperty.call(data, 'key')
          ? { key: data.key || '' }
          : {}),
        ...(data.model ? { model: data.model } : {}),
        ...(data.method ? { method: data.method } : {}),
        ...(data.transport ? { transport: data.transport } : {}),
        configured: !!data.configured,
        port: null
      }
      mindmapDevDebug('mindmap-ai', 'store.setHostAiConfig after', {
        hasApi: !!state.aiConfig.api,
        apiTail: state.aiConfig.api ? String(state.aiConfig.api).slice(-32) : '',
        keyLen: state.aiConfig.key ? state.aiConfig.key.length : 0,
        hasKey: !!state.aiConfig.key,
        model: state.aiConfig.model,
        transport: state.aiConfig.transport,
        configured: !!state.aiConfig.configured,
        method: state.aiConfig.method,
        port: state.aiConfig.port,
        complete: !!(
          String(state.aiConfig.api || '').trim() &&
          (
            state.aiConfig.transport === 'host-proxy'
              ? state.aiConfig.configured
              : String(state.aiConfig.key || '').trim()
          ) &&
          String(state.aiConfig.model || '').trim()
        )
      })
    },

    // 设置当前显示的侧边栏
    setActiveSidebar(state, data) {
      const previous = state.activeSidebar
      state.previousActiveSidebar = previous
      state.activeSidebar = data
      sidebarDebugSetActiveSidebar(previous, data, 'mutation')
    },


    // 设置大纲编辑模式
    setIsOutlineEdit(state, data) {
      state.isOutlineEdit = data
    },

    // 设置是否只读
    setIsReadonly(state, data) {
      state.isReadonly = data
    },

    // 设置源码编辑模式
    setIsSourceCodeEdit(state, data) {
      state.isSourceCodeEdit = data
    },

    // 设置导出时底部添加的文字
    setExtraTextOnExport(state, data) {
      state.extraTextOnExport = data
    },

    // 设置树节点拖拽
    setIsDragOutlineTreeNode(state, data) {
      state.isDragOutlineTreeNode = data
    },

    // 扩展主题列表
    setExtendThemeGroupList(state, data) {
      state.extendThemeGroupList = data
    },

    // 设置背景图片列表
    setBgList(state, data) {
      state.bgList = data
    }
  },
  actions: {}
})

export default store
