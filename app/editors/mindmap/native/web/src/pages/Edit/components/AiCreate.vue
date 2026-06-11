<template>
  <div>
    <AiConfigDialog v-model="aiConfigDialogVisible"></AiConfigDialog>
  </div>
</template>

<script>
import Ai from '@/utils/ai'
import {
  parseAiFinalOrganizeResult,
  quillHtmlToRichTextJson,
  summarizeRichTextJson
} from '@/utils/aiTreeJson'
import {
  applyAiOperationStreamContent,
  commitAiOperationTransactionState,
  createAiOperationTransactionState,
  endAiOperationTransactionState,
  rollbackAiOperationTransactionState
} from '@/utils/aiOperationTransaction'
import { applyAiOrganizeResultToMindMap } from '@/utils/mindMapAiNodeMutation'
import {
  buildLeadingSpaceRule,
  buildStyledOutputExamples,
  buildStyleSchemaText,
  buildTextSchemaSuffix,
  buildVisualReferenceText
} from '@/utils/aiRichTextCapability'
import { createUid, getStrWithBrFromHtml } from 'simple-mind-map/src/utils'
import {
  AI_CONTEXT_CHAR_LIMIT,
  buildAiChildrenContext,
  createEmptyAiChildrenContext,
  normalizeContextCharLimit
} from '@/utils/aiContext'
import { mapState } from 'vuex'
import AiConfigDialog from './AiConfigDialog.vue'
import { isHostMode, openAISettings } from '@/utils/hostBridge'
import { mindmapDevDebug } from '@/utils/mindmapDevDebug'
import {
  AI_EDIT_SCOPE,
  buildAiOperationProtocolPrompt,
  createAiOperationPolicy,
  normalizeAiEditScope
} from '@/utils/aiOperationPolicy'

export default {
  components: {
    AiConfigDialog
  },
  props: {
    mindMap: {
      type: Object
    }
  },
  beforeCreate() {
    this._beingOrganizeNode = null
    this._aiOpTransaction = null
    this._aiInteractionGuard = null
    this._aiBlockedCommandNotified = false
  },
  data() {
    return {
      aiInstance: null,
      isAiCreating: false,
      aiConfigDialogVisible: false,

      organizeEditScope: AI_EDIT_SCOPE.CURRENT,
      organizeCreateChildren: false,
      organizeAllowDeleteNodes: false,
      organizeContextCharLimit: AI_CONTEXT_CHAR_LIMIT.DEFAULT,
      organizeRequirement: '',
      beingOrganizeNodeUid: '',
      aiStreamingContent: '',
      isHostMode: isHostMode()
    }
  },
  computed: {
    ...mapState(['aiConfig']),
    hasAiConfig() {
      const isHostProxy = this.aiConfig.transport === 'host-proxy'
      return !!(
        String(this.aiConfig.api || '').trim() &&
        (isHostProxy
          ? this.aiConfig.configured
          : String(this.aiConfig.key || '').trim()) &&
        String(this.aiConfig.model || '').trim()
      )
    }
  },
  watch: {
    aiConfig: {
      deep: true,
      immediate: true,
      handler() {
        mindmapDevDebug('mindmap-ai', 'AiCreate.aiConfig changed', {
          ...this.getAiConfigDebugSummary(),
          hasAiConfig: this.hasAiConfig
        })
      }
    },
    hasAiConfig(value) {
      mindmapDevDebug('mindmap-ai', 'AiCreate.hasAiConfig changed', {
        value,
        ...this.getAiConfigDebugSummary()
      })
    }
  },
  created() {
    mindmapDevDebug('mindmap-ai', 'AiCreate.created register listeners', {
      isHostMode: this.isHostMode,
      ...this.getAiConfigDebugSummary(),
      hasAiConfig: this.hasAiConfig
    })
    this.$bus.$on('ai_organize_node', this.handleAiOrganizeNode)
    this.$bus.$on('ai_stop_create', this.stopCreate)
    this.$bus.$on('showAiConfigDialog', this.showAiConfigDialog)
  },
  mounted() {
    mindmapDevDebug('mindmap-ai', 'AiCreate.mounted', {
      isHostMode: this.isHostMode,
      ...this.getAiConfigDebugSummary(),
      hasAiConfig: this.hasAiConfig
    })
  },
  beforeDestroy() {
    mindmapDevDebug('mindmap-ai', 'AiCreate.beforeDestroy unregister listeners')
    this.rollbackAiOperationTransaction('destroy')
    this.stopAiInteractionGuard()
    this.$bus.$off('ai_organize_node', this.handleAiOrganizeNode)
    this.$bus.$off('ai_stop_create', this.stopCreate)
    this.$bus.$off('showAiConfigDialog', this.showAiConfigDialog)
  },
  methods: {
    getAiConfigDebugSummary() {
      return {
        hasApi: !!String(this.aiConfig.api || '').trim(),
        apiLen: this.aiConfig.api ? String(this.aiConfig.api).length : 0,
        apiTail: this.aiConfig.api ? String(this.aiConfig.api).slice(-32) : '',
        hasKey: !!String(this.aiConfig.key || '').trim(),
        keyLen: this.aiConfig.key ? String(this.aiConfig.key).length : 0,
        hasModel: !!String(this.aiConfig.model || '').trim(),
        model: this.aiConfig.model,
        transport: this.aiConfig.transport,
        configured: !!this.aiConfig.configured,
        method: this.aiConfig.method,
        port: this.aiConfig.port
      }
    },

    // 显示AI配置修改弹窗
    showAiConfigDialog() {
      mindmapDevDebug('mindmap-ai', 'AiCreate.showAiConfigDialog', {
        isHostMode: this.isHostMode,
        hasAiConfig: this.hasAiConfig,
        ...this.getAiConfigDebugSummary()
      })
      if (this.isHostMode) {
        openAISettings()
        return
      }
      this.aiConfigDialogVisible = true
    },

    // 检测ai是否可用
    async aiTest() {
      mindmapDevDebug('mindmap-ai', 'AiCreate.aiTest start', {
        isHostMode: this.isHostMode,
        hasAiConfig: this.hasAiConfig,
        ...this.getAiConfigDebugSummary()
      })
      // 检查配置
      if (!this.hasAiConfig) {
        mindmapDevDebug('mindmap-ai', 'AiCreate.aiTest missing config', {
          ...this.getAiConfigDebugSummary()
        })
        this.showAiConfigDialog()
        throw new Error(this.$t('ai.configurationMissing'))
      }
      mindmapDevDebug('mindmap-ai', 'AiCreate.aiTest pass', {
        ...this.getAiConfigDebugSummary()
      })
    },

    broadcastAiStatus() {
      const node = this.getBeingOrganizeNode()
      const targetUid = this.beingOrganizeNodeUid || (node && node.getData('uid')) || ''
      const targetName = node ? this.getNodePlainText(node).slice(0, 40) : ''
      const payload = {
        creating: this.isAiCreating,
        targetUid,
        targetName,
        scope: this.getAiEditScope()
      }
      mindmapDevDebug('mindmap-ai-freeze', 'AiCreate.broadcastAiStatus', {
        ...payload,
        hasNode: !!node
      })
      this.$bus.$emit('ai_create_status', payload)
    },

    broadcastAiStreamContent(content) {
      this.$bus.$emit('ai_stream_content', content || '')
    },

    isAiViewCommand(name, args) {
      if (name === 'SET_NODE_EXPAND') {
        return true
      }
      if (name !== 'SET_NODE_DATA') {
        return false
      }
      const data = args && args[1] ? args[1] : {}
      const keys = Object.keys(data)
      return keys.length > 0 && keys.every(key => key === 'expand')
    },

    isAiSelectionFreezeCommand(name, args) {
      if (name === 'SET_NODE_ACTIVE' || name === 'CLEAR_ACTIVE_NODE') {
        return true
      }
      if (name !== 'SET_NODE_DATA') {
        return false
      }
      const data = args && args[1] ? args[1] : {}
      const keys = Object.keys(data)
      return keys.length > 0 && keys.every(key => key === 'isActive')
    },

    handleBeforeExecCommand(event) {
      const name = event && event.name
      const args = event && event.args ? event.args : []
      const context = event && event.context ? event.context : null
      const isViewCommand = this.isAiViewCommand(name, args)
      if (
        !this.isAiCreating ||
        (context && context.source === 'ai') ||
        isViewCommand
      ) {
        if (this.isAiCreating) {
          mindmapDevDebug('mindmap-ai-freeze', 'allow command during ai creating', {
            name,
            isViewCommand,
            contextSource: context && context.source,
            argSummary: args.map(arg => {
              if (arg && arg.getData) {
                return {
                  nodeUid: arg.getData('uid'),
                  nodeText: this.getNodePlainText(arg).slice(0, 30)
                }
              }
              if (arg && typeof arg === 'object') {
                return {
                  keys: Object.keys(arg),
                  isActive: arg.isActive,
                  expand: arg.expand
                }
              }
              return arg
            })
          })
        }
        return true
      }
      const isSelectionFreezeCommand = this.isAiSelectionFreezeCommand(name, args)
      mindmapDevDebug('mindmap-ai-freeze', `blocked command during ai creating: ${name}`, {
        name,
        isSelectionFreezeCommand,
        contextSource: context && context.source,
        argSummary: args.map(arg => {
          if (arg && arg.getData) {
            return {
              nodeUid: arg.getData('uid'),
              nodeText: this.getNodePlainText(arg).slice(0, 30)
            }
          }
          if (arg && typeof arg === 'object') {
            return {
              keys: Object.keys(arg),
              isActive: arg.isActive,
              expand: arg.expand
            }
          }
          return arg
        })
      })
      if (!isSelectionFreezeCommand && !this._aiBlockedCommandNotified) {
        this._aiBlockedCommandNotified = true
        this.$message.warning(this.$t('ai.aiCreatingOperationBlocked'))
      }
      return false
    },

    runAiOperationMutation(fn) {
      if (
        this.mindMap &&
        this.mindMap.command &&
        this.mindMap.command.runWithContext
      ) {
        return this.mindMap.command.runWithContext(
          { source: 'ai', reason: 'organize-node' },
          fn
        )
      }
      return fn()
    },

    getAiTransactionDeps(extra = {}) {
      return {
        cloneJson: this.cloneJson.bind(this),
        ensureAiNodeDataUid: this.ensureAiNodeDataUid.bind(this),
        getAiOperationPermission: this.getAiOperationPermission.bind(this),
        buildOriginalNodeRefMap: this.buildOriginalNodeRefMap.bind(this),
        runAiOperationMutation: this.runAiOperationMutation.bind(this),
        debug: mindmapDevDebug,
        ...extra
      }
    },

    startAiInteractionGuard() {
      if (!this.mindMap || this._aiInteractionGuard) {
        return
      }
      const originalBeforeTextEdit = this.mindMap.opt.beforeTextEdit
      const originalBeforeDragStart = this.mindMap.opt.beforeDragStart
      this._aiBlockedCommandNotified = false
      this._aiInteractionGuard = {
        beforeTextEdit: originalBeforeTextEdit,
        beforeDragStart: originalBeforeDragStart
      }
      this.mindMap.on('beforeExecCommand', this.handleBeforeExecCommand)
      this.mindMap.updateConfig({
        beforeTextEdit: async (...args) => {
          if (this.isAiCreating) {
            return false
          }
          if (typeof originalBeforeTextEdit === 'function') {
            return originalBeforeTextEdit(...args)
          }
          return true
        },
        beforeDragStart: async (...args) => {
          if (this.isAiCreating) {
            return true
          }
          if (typeof originalBeforeDragStart === 'function') {
            return originalBeforeDragStart(...args)
          }
          return false
        }
      })
    },

    stopAiInteractionGuard() {
      if (!this.mindMap || !this._aiInteractionGuard) {
        return
      }
      this.mindMap.off('beforeExecCommand', this.handleBeforeExecCommand)
      this.mindMap.updateConfig({
        beforeTextEdit: this._aiInteractionGuard.beforeTextEdit || null,
        beforeDragStart: this._aiInteractionGuard.beforeDragStart || null
      })
      this._aiInteractionGuard = null
      this._aiBlockedCommandNotified = false
    },

    // AI请求完成或出错后需要复位的数据
    resetOnAiCreatingStop() {
      this.isAiCreating = false
      this.aiInstance = null
      this.stopAiInteractionGuard()
      this.broadcastAiStatus()
    },

    // 停止生成
    stopCreate() {
      if (this.aiInstance) {
      this.aiInstance.stop()
        this.aiInstance = null
      }
      this.rollbackAiOperationTransaction('stopped')
      this.isAiCreating = false
      this.stopAiInteractionGuard()
      this.broadcastAiStatus()
      this.$message.success(this.$t('ai.stoppedGenerating'))
    },

    getNodePlainText(node) {
      if (!node) return ''
      return getStrWithBrFromHtml(node.getData('text') || '').trim()
    },

    getNodeRichTextJson(node) {
      if (!node) {
        return {
          paragraphs: []
        }
      }
      return quillHtmlToRichTextJson(node.getData('text') || '')
    },

    getNodeNoteText(node) {
      if (!node) return ''
      return getStrWithBrFromHtml(node.getData('note') || '').trim()
    },

    getNodeStylePromptSummary(node) {
      if (!node || !node.getStyle) {
        return '{}'
      }
      const keys = [
        'shape',
        'fillColor',
        'borderColor',
        'borderWidth',
        'borderRadius',
        'color',
        'fontFamily',
        'fontSize',
        'fontWeight',
        'fontStyle',
        'textDecoration',
        'textAlign',
        'lineColor',
        'lineWidth',
        'lineDasharray'
      ]
      const summary = {}
      keys.forEach(key => {
        const value = node.getStyle(key, false)
        if (value !== undefined && value !== null && value !== '') {
          summary[key] = value
        }
      })
      return JSON.stringify(summary)
    },

    getAiEditScope() {
      return normalizeAiEditScope(this.organizeEditScope)
    },

    getAiOperationPermission() {
      return createAiOperationPolicy({
        scope: this.organizeEditScope,
        allowCreateChildren: this.organizeCreateChildren,
        allowDeleteNodes: this.organizeAllowDeleteNodes
      })
    },

    cloneJson(value) {
      return JSON.parse(JSON.stringify(value))
    },

    ensureAiNodeDataUid(dataNode) {
      if (!dataNode || !dataNode.data) {
        return dataNode
      }
      if (!dataNode.data.uid) {
        dataNode.data.uid = createUid()
      }
      const children = Array.isArray(dataNode.children) ? dataNode.children : []
      children.forEach(child => {
        this.ensureAiNodeDataUid(child)
      })
      return dataNode
    },

    buildOriginalNodeRefMap(nodeData, permission = this.getAiOperationPermission()) {
      const refToUid = {}
      const allowedUidSet = new Set()
      const walk = (dataNode, ref) => {
        if (!dataNode || !dataNode.data || !dataNode.data.uid) {
            return
          }
        refToUid[ref] = dataNode.data.uid
        allowedUidSet.add(dataNode.data.uid)
        if (!permission.canEditChildren) {
          return
        }
        const children = Array.isArray(dataNode.children)
          ? dataNode.children
          : []
        children.forEach((child, index) => {
          walk(child, `${ref === 'current' ? 'child' : ref}-${index + 1}`)
        })
      }
      walk(nodeData, 'current')
      return {
        refToUid,
        allowedUidSet
      }
    },

    createAiOperationTransaction(node) {
      const permission = this.getAiOperationPermission()
      this._aiOpTransaction = createAiOperationTransactionState({
        mindMap: this.mindMap,
        node,
        permission,
        buildOriginalNodeRefMap: this.buildOriginalNodeRefMap,
        debug: mindmapDevDebug
      })
      return this._aiOpTransaction
    },

    endAiOperationTransaction() {
      endAiOperationTransactionState(this.mindMap)
      this._aiOpTransaction = null
    },

    rollbackAiOperationTransaction(reason = 'rollback') {
      rollbackAiOperationTransactionState(
        this.mindMap,
        this._aiOpTransaction,
        this.getAiTransactionDeps({ reason })
      )
      this._aiOpTransaction = null
    },

    commitAiOperationTransaction() {
      commitAiOperationTransactionState(
        this.mindMap,
        this._aiOpTransaction,
        this.getAiTransactionDeps()
      )
      this._aiOpTransaction = null
    },

    applyAiOperationStreamContent(content, final = false) {
      return applyAiOperationStreamContent(
        this.mindMap,
        this._aiOpTransaction,
        content,
        final,
        this.getAiTransactionDeps()
      )
    },

    getBeingOrganizeNode() {
      if (this.beingOrganizeNodeUid && this.mindMap && this.mindMap.renderer) {
        return this.mindMap.renderer.findNodeByUid(this.beingOrganizeNodeUid)
      }
      return this._beingOrganizeNode
    },

    escapePromptXml(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
    },

    handleAiOrganizeNode(arg) {
      if (arg && arg.fromSidebar) {
        this.handleSidebarAiOrganize(arg)
        return
      }
      mindmapDevDebug('mindmap-ai', 'AiCreate.handleAiOrganizeNode ignored', {
        hasArg: !!arg,
        fromSidebar: !!(arg && arg.fromSidebar)
      })
    },

    handleSidebarAiOrganize(arg) {
      const nodes = this.mindMap.renderer
        ? this.mindMap.renderer.activeNodeList || []
        : []
      let node = nodes.length > 0 ? nodes[0] : null
      if (!node) {
        node = this.mindMap.renderer ? this.mindMap.renderer.root : null
      }
      if (!node) {
        this.$message.warning(this.$t('ai.emptyCurrentNode') || '没有可操作的节点')
          return
        }
      this._beingOrganizeNode = node
      this.beingOrganizeNodeUid = node.getData('uid') || ''
      this.organizeEditScope =
        arg.scope === AI_EDIT_SCOPE.SUBTREE
          ? AI_EDIT_SCOPE.SUBTREE
          : AI_EDIT_SCOPE.CURRENT
      this.organizeCreateChildren =
        arg.scope === AI_EDIT_SCOPE.SUBTREE && !!arg.allowCreateChildren
      this.organizeAllowDeleteNodes =
        arg.scope === AI_EDIT_SCOPE.SUBTREE && !!arg.allowDeleteNodes
      this.organizeContextCharLimit = normalizeContextCharLimit(
        arg.contextCharLimit
      )
      this.organizeRequirement = arg.prompt || ''
      this.aiStreamingContent = ''
      mindmapDevDebug('mindmap-ai', 'AiCreate.handleSidebarAiOrganize', {
        nodeUid: this.beingOrganizeNodeUid,
        scope: arg.scope,
        allowCreateChildren: this.organizeCreateChildren,
        allowDeleteNodes: this.organizeAllowDeleteNodes,
        contextCharLimit: this.organizeContextCharLimit,
        promptLen: (arg.prompt || '').length
      })
      this.confirmAiOrganize()
    },

    resetAiOrganizeTarget() {
      this._beingOrganizeNode = null
      this.beingOrganizeNodeUid = ''
      this.organizeEditScope = AI_EDIT_SCOPE.CURRENT
      this.organizeCreateChildren = false
      this.organizeAllowDeleteNodes = false
      this.organizeContextCharLimit = AI_CONTEXT_CHAR_LIMIT.DEFAULT
      this.organizeRequirement = ''
      this.aiStreamingContent = ''
    },

    buildAiOrganizePrompt(node) {
      const permission = this.getAiOperationPermission()
      const currentText = this.escapePromptXml(this.getNodePlainText(node))
      const currentRichTextJson = this.getNodeRichTextJson(node)
      const currentRichTextSummary = summarizeRichTextJson(currentRichTextJson)
      const currentRichText = this.escapePromptXml(
        JSON.stringify(currentRichTextJson)
      )
      const currentStyle = this.escapePromptXml(
        this.getNodeStylePromptSummary(node)
      )
      const note = this.escapePromptXml(this.getNodeNoteText(node))
      const childrenContext = permission.canEditChildren
        ? buildAiChildrenContext(node, this.organizeContextCharLimit)
        : createEmptyAiChildrenContext(this.organizeContextCharLimit)
      const childrenSummary = permission.canEditChildren
        ? this.escapePromptXml(childrenContext.text)
        : ''
      const requirement = this.escapePromptXml(this.organizeRequirement.trim())
      const allowCreateChildren = permission.canCreateChildren ? 'true' : 'false'
      const allowDeleteNodes = permission.canDeleteChildren ? 'true' : 'false'
      const childrenRefActions = permission.canDeleteChildren
        ? 'update_node/delete_node'
        : 'update_node'
      const childrenSummaryXml = permission.canEditChildren
        ? `  <children_summary>${childrenSummary || '无'}</children_summary>\n`
        : ''
      const protocol = buildAiOperationProtocolPrompt(permission)
      const contextReferenceXml = permission.canEditChildren
        ? `<context_reference>
  children_summary 会在上下文上限内按深度优先列出后代节点；每行的 id 可用于 ${childrenRefActions}，deep 表示相对 current 的深度。
  如果某行 deep=-1，表示该节点或后续内容已因上下文上限被截断，不要据此编造未看到的后代内容。
</context_reference>`
        : ''
      const leadingSpaceRule = buildLeadingSpaceRule()
      const styledExample = buildStyledOutputExamples()
      mindmapDevDebug('mindmap-ai-richtext', 'build prompt rich text policy', {
        nodeUid: node && node.getData ? node.getData('uid') : '',
        plainTextLen: this.getNodePlainText(node).length,
        noteLen: this.getNodeNoteText(node).length,
        requirementLen: this.organizeRequirement.trim().length,
        requirementPreview: this.organizeRequirement.trim().slice(0, 80),
        editScope: permission.editScope,
        canEditChildren: permission.canEditChildren,
        canCreateChildren: permission.canCreateChildren,
        canDeleteChildren: permission.canDeleteChildren,
        allowDeleteNodes: this.organizeAllowDeleteNodes,
        childrenContextCharLimit: childrenContext.charLimit,
        childrenContextChars: childrenContext.usedChars,
        childrenContextNodeCount: childrenContext.nodeCount,
        childrenContextIncludedNodeCount: childrenContext.includedNodeCount,
        childrenContextTruncated: childrenContext.truncated,
        styledExampleIncluded: !!styledExample,
        currentRichTextSummary
      })
      return `<mindmap_ai_task>
<task>按 user_requirement 修改 MindMap 节点内容，并保持结果适合思维导图阅读。</task>
<user_requirement>${requirement || '请按通用整理要求优化当前节点。'}</user_requirement>
<selected_node>
  <id>current</id>
  <text>${currentText}</text>
  <rich_text_json>${currentRichText}</rich_text_json>
  <current_node_style>${currentStyle}</current_node_style>
  <note>${note}</note>
${childrenSummaryXml.trimEnd()}
</selected_node>
<mode>
  <edit_scope>${permission.editScope}</edit_scope>
  <can_update_children>${
    permission.canEditChildren ? 'true' : 'false'
  }</can_update_children>
  <can_create_children>${allowCreateChildren}</can_create_children>
  <can_delete_nodes>${allowDeleteNodes}</can_delete_nodes>
</mode>
<operation_protocol>
  <streaming_rule>只输出 NDJSON：每行一个完整 JSON 对象，对象之间必须换行。禁止输出 Markdown、代码块、解释文字、JSON 数组，禁止把两个 JSON 对象连在同一行。</streaming_rule>
  <operations>
${protocol.operations}
  </operations>
  <permission_rules>
${protocol.permissionRules}
  </permission_rules>
</operation_protocol>
${contextReferenceXml}
<rules>
  <scope>新增、删除、更新子节点只以 operations 和 permission_rules 为准。</scope>
  <content>按 user_requirement 修改；若只要求样式、格式、颜色、高亮、下划线、缩进或空格，必须保留原文，不改写、不删除、不新增文本。</content>
  <style_scope>需要给“全部/所有/整体”加样式时，按 edit_scope 覆盖每个目标节点；输出完整 text.paragraphs/spans，只在对应 span 增减样式字段。</style_scope>
  <visual_reference>${buildVisualReferenceText()}</visual_reference>
  <hierarchy>层级、列表、大纲内容：允许 add_child 时优先创建真实子节点；否则用普通段落。不要用 paragraph.indent 或 span.text 前导空格模拟思维导图树形层级。</hierarchy>
  ${leadingSpaceRule}
  <text_schema>${buildTextSchemaSuffix(protocol.childrenField)}</text_schema>
  <style_schema>${buildStyleSchemaText()}</style_schema>
  <text_limits>span.text 只能是普通可见文本；不要输出 HTML、Markdown、class、style、HTML 实体或制表符。例：输出 "Star & Fork"，不要输出 "Star &amp; Fork"。按 user_requirement 决定是否输出 span.text 行首空格；需要视觉缩进时在 span.text 开头写普通空格，不需要时不要添加。</text_limits>
  <default_style>默认不要输出 align、bold、italic、underline、strike、color、background、font、size。仅用户要求样式变化时新增/改变样式；只改写文字时尽量保留 rich_text_json 中已有样式。</default_style>
  <unsupported>禁止输出 HTML、Markdown、表格、代码块、引用块、任务列表、simpleMindMap 剪贴板 JSON 或整图 JSON；不要把 rich_text_json 原样当字符串输出。</unsupported>
</rules>
<output_examples>
{"op":"update_current","text":{"paragraphs":[{"spans":[{"text":"整理后的内容"}]}]}}
${styledExample.trimEnd()}
${protocol.addChildExample}
{"op":"done"}
</output_examples>
</mindmap_ai_task>`
    },

    async confirmAiOrganize() {
      const node = this.getBeingOrganizeNode()
      const permission = this.getAiOperationPermission()
      mindmapDevDebug('mindmap-ai', 'AiCreate.confirmAiOrganize start', {
        hasNode: !!node,
        nodeUid: this.beingOrganizeNodeUid,
        editScope: permission.editScope,
        canEditChildren: permission.canEditChildren,
        canCreateChildren: permission.canCreateChildren,
        canDeleteChildren: permission.canDeleteChildren,
        allowCreateChildren: this.organizeCreateChildren,
        allowDeleteNodes: this.organizeAllowDeleteNodes,
        requirementLen: this.organizeRequirement.trim().length,
        hasAiConfig: this.hasAiConfig,
        ...this.getAiConfigDebugSummary()
      })
      if (!node) return
      if (!this.getNodePlainText(node) && !this.getNodeNoteText(node)) {
        mindmapDevDebug('mindmap-ai', 'AiCreate.confirmAiOrganize empty node', {
          nodeUid: this.beingOrganizeNodeUid
        })
        this.$message.warning(this.$t('ai.emptyCurrentNode'))
        return
      }
      try {
        await this.aiTest()
        const prompt = this.buildAiOrganizePrompt(node)
        mindmapDevDebug('mindmap-ai', 'AiCreate.confirmAiOrganize request', {
          promptLen: prompt.length,
          editScope: permission.editScope,
          canEditChildren: permission.canEditChildren,
          canCreateChildren: permission.canCreateChildren,
          canDeleteChildren: permission.canDeleteChildren,
          allowCreateChildren: this.organizeCreateChildren,
          allowDeleteNodes: this.organizeAllowDeleteNodes,
          ...this.getAiConfigDebugSummary()
        })
        this.isAiCreating = true
        this.aiStreamingContent = ''
        this.startAiInteractionGuard()
        this.broadcastAiStatus()
        this.createAiOperationTransaction(node)
        this.aiInstance = new Ai()
        this.aiInstance.init('huoshan', this.aiConfig)
        let requestCancelled = false
        this.aiInstance.request(
          {
            messages: [
              {
                role: 'user',
                content: prompt
              }
            ]
          },
          content => {
            if (requestCancelled) {
              return
            }
            this.aiStreamingContent = content || ''
            this.broadcastAiStreamContent(content)
            try {
              const streamResult = this.applyAiOperationStreamContent(
                content || '',
                false
              )
              if (streamResult.appliedCount > 0) {
                mindmapDevDebug(
                  'mindmap-ai-opstream',
                  'stream operations applied',
                  {
                    appliedCount: streamResult.appliedCount,
                    done: streamResult.done
                  }
                )
              }
            } catch (error) {
              const tx = this._aiOpTransaction
              if (tx && tx.appliedCount <= 0) {
                mindmapDevDebug(
                  'mindmap-ai-opstream',
                  'defer stream parse failure for fallback',
                  {
                    message:
                      error && error.message ? error.message : String(error)
                  }
                )
                return
              }
              requestCancelled = true
              console.log(error)
              mindmapDevDebug('mindmap-ai-opstream', 'stream apply failed', {
                message: error && error.message ? error.message : String(error)
              })
              if (this.aiInstance) {
                this.aiInstance.stop()
              }
              this.rollbackAiOperationTransaction('stream-error')
              this.resetOnAiCreatingStop()
              this.resetAiOrganizeTarget()
              this.$message.error(this.$t('ai.invalidAiResult'))
            }
          },
          content => {
            if (requestCancelled) {
              return
            }
            this.aiStreamingContent = content || ''
            mindmapDevDebug('mindmap-ai', 'AiCreate.confirmAiOrganize response', {
              contentLen: content ? String(content).length : 0,
              editScope: permission.editScope,
              allowCreateChildren: this.organizeCreateChildren,
              allowDeleteNodes: this.organizeAllowDeleteNodes
            })
            try {
              const tx = this._aiOpTransaction
              try {
                this.applyAiOperationStreamContent(content || '', true)
                if (tx && (tx.appliedCount > 0 || tx.done)) {
                  this.commitAiOperationTransaction()
                  this.$message.success(this.$t('ai.aiGenerationSuccess'))
                  return
                }
              } catch (streamError) {
                if (tx && tx.appliedCount > 0) {
                  throw streamError
                }
              }
              const result = parseAiFinalOrganizeResult(content, {
                allowChildren: permission.canCreateChildren,
                allowInlineStyles: permission.allowInlineStyles
              })
              mindmapDevDebug('mindmap-ai', 'AiCreate.confirmAiOrganize parsed', {
                hasCurrent: !!(result && result.current),
                childrenCount:
                  result && result.children ? result.children.length : 0,
                currentRichTextSummary:
                  result && result.current && result.current.data
                    ? summarizeRichTextJson(
                        quillHtmlToRichTextJson(result.current.data.text || '')
                      )
                    : null,
                childrenRichTextSummary:
                  result && Array.isArray(result.children)
                    ? result.children.slice(0, 5).map(child => {
                        return summarizeRichTextJson(
                          quillHtmlToRichTextJson(
                            child && child.data ? child.data.text || '' : ''
                          )
                        )
                      })
                    : []
              })
              this.applyAiOrganizeResult(result)
              this.$message.success(this.$t('ai.aiGenerationSuccess'))
            } catch (error) {
              console.log(error)
              this.rollbackAiOperationTransaction('final-error')
              this.$message.error(this.$t('ai.invalidAiResult'))
            } finally {
              this.resetOnAiCreatingStop()
              this.resetAiOrganizeTarget()
            }
          },
          () => {
            this.rollbackAiOperationTransaction('request-error')
            this.resetOnAiCreatingStop()
            this.resetAiOrganizeTarget()
            this.$message.error(this.$t('ai.generationFailed'))
          }
        )
      } catch (error) {
        console.log(error)
        mindmapDevDebug('mindmap-ai', 'AiCreate.confirmAiOrganize failed', {
          message: error && error.message ? error.message : String(error),
          stack: error && error.stack ? error.stack : ''
        })
        if (!this.hasAiConfig) {
          this.$message.warning(this.$t('ai.configurationMissing'))
        }
      }
    },

    applyAiOrganizeResult(result) {
      const committed = this.runAiOperationMutation(() => {
        applyAiOrganizeResultToMindMap(
          this.mindMap,
          this.beingOrganizeNodeUid,
          result,
          {
            cloneJson: this.cloneJson.bind(this),
            ensureAiNodeDataUid: this.ensureAiNodeDataUid.bind(this)
          }
        )
        this.mindMap.render(null, 'ai-organize-fallback')
        return true
      })
      if (committed) {
        this.commitAiOperationTransaction()
        mindmapDevDebug('mindmap-ai-opstream', 'fallback commit', {
          childrenCount: result.children ? result.children.length : 0
        })
      } else {
        this.endAiOperationTransaction()
      }
    }
  }
}
</script>

