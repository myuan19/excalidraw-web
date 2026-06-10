<template>
  <div>
    <AiConfigDialog v-model="aiConfigDialogVisible"></AiConfigDialog>
  </div>
</template>

<script>
import Ai from '@/utils/ai'
import {
  parseAiOrganizeJson,
  quillHtmlToRichTextJson,
  summarizeRichTextJson
} from '@/utils/aiTreeJson'
import {
  getAiOperationKey,
  parseAiOperationStreamChunk
} from '@/utils/aiOperationStream'
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
  assertAiOperationAllowed,
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
      return !!(
        String(this.aiConfig.api || '').trim() &&
        String(this.aiConfig.key || '').trim() &&
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
      const baseFullData = this.mindMap.getData(true)
      const permission = this.getAiOperationPermission()
      const refState = this.buildOriginalNodeRefMap(node.nodeData, permission)
      if (this.mindMap.command && this.mindMap.command.pause) {
        this.mindMap.command.pause()
      }
      this._aiOpTransaction = {
        baseFullData,
        permission,
        targetUid: node.getData('uid'),
        originalRefToUid: refState.refToUid,
        allowedUidSet: refState.allowedUidSet,
        createdNodeIds: {},
        createdUidSet: new Set(),
        appliedOpIds: new Set(),
        offset: 0,
        appliedCount: 0,
        done: false
      }
      mindmapDevDebug('mindmap-ai-opstream', 'transaction start', {
        targetUid: this._aiOpTransaction.targetUid,
        editScope: permission.editScope,
        canCreateChildren: permission.canCreateChildren,
        canDeleteChildren: permission.canDeleteChildren,
        allowedOps: permission.allowedOps,
        allowedOriginalCount: this._aiOpTransaction.allowedUidSet.size
      })
      return this._aiOpTransaction
    },

    endAiOperationTransaction() {
      if (this.mindMap.command && this.mindMap.command.recovery) {
        this.mindMap.command.recovery()
      }
      this._aiOpTransaction = null
    },

    rollbackAiOperationTransaction(reason = 'rollback') {
      const tx = this._aiOpTransaction
      if (!tx) {
        return
      }
      this.runAiOperationMutation(() => {
        this.mindMap.renderer.setData(this.cloneJson(tx.baseFullData.root))
        this.mindMap.reRender()
      })
      mindmapDevDebug('mindmap-ai-opstream', 'transaction rollback', {
        reason,
        appliedCount: tx.appliedCount
      })
      this.endAiOperationTransaction()
    },

    commitAiOperationTransaction() {
      const tx = this._aiOpTransaction
      if (!tx) {
        return
      }
      const appliedCount = tx.appliedCount
      this.endAiOperationTransaction()
      if (this.mindMap.command && this.mindMap.command.addHistory) {
        this.mindMap.command.addHistory()
      }
      mindmapDevDebug('mindmap-ai-opstream', 'transaction commit', {
        appliedCount
      })
    },

    resolveAiOperationRef(ref) {
      const tx = this._aiOpTransaction
      if (!tx) {
        return ''
      }
      if (ref === 'current') {
        return tx.targetUid
      }
      if (tx.createdNodeIds[ref]) {
        return tx.createdNodeIds[ref]
      }
      if (tx.originalRefToUid[ref]) {
        return tx.originalRefToUid[ref]
      }
      if (tx.allowedUidSet.has(ref) || tx.createdUidSet.has(ref)) {
        return ref
      }
      return ''
    },

    skipAiOperation(operation, reason, extra = {}) {
      const tx = this._aiOpTransaction
      if (!tx) {
        return false
      }
      const operationKey = getAiOperationKey(operation)
      if (operationKey) {
        tx.appliedOpIds.add(operationKey)
      }
      mindmapDevDebug('mindmap-ai-opstream', 'skip operation', {
        reason,
        op: operation && operation.op,
        id: operation && operation.id,
        parent: operation && operation.parent,
        ...extra
      })
      return false
    },

    findAiDataNodeByUid(uid) {
      const root =
        this.mindMap && this.mindMap.renderer
          ? this.mindMap.renderer.renderTree
          : null
      let result = null
      const walk = (dataNode, parent = null, index = -1) => {
        if (!dataNode || result) {
          return
        }
        if (dataNode.data && dataNode.data.uid === uid) {
          result = {
            dataNode,
            parent,
            index
          }
          return
        }
        const children = Array.isArray(dataNode.children)
          ? dataNode.children
          : []
        children.forEach((child, childIndex) => {
          walk(child, dataNode, childIndex)
        })
      }
      walk(root)
      return result
    },

    markAiDataNodeNeedUpdate(uid) {
      const targetRef = this.findAiDataNodeByUid(uid)
      if (targetRef && targetRef.dataNode && targetRef.dataNode.data) {
        targetRef.dataNode.data.needUpdate = true
      }
    },

    assertAiOperationNodeInScope(uid) {
      const tx = this._aiOpTransaction
      if (!tx || !uid) {
        throw new Error('ai operation target missing')
      }
      if (
        uid !== tx.targetUid &&
        !tx.allowedUidSet.has(uid) &&
        !tx.createdUidSet.has(uid)
      ) {
        throw new Error('ai operation target out of scope')
      }
    },

    assertAiOperationPermission(operation) {
      const tx = this._aiOpTransaction
      const permission = tx ? tx.permission : this.getAiOperationPermission()
      assertAiOperationAllowed(permission, operation)
    },

    applyAiOperation(operation) {
      const tx = this._aiOpTransaction
      if (!tx) {
        throw new Error('ai operation transaction missing')
      }
      const operationKey = getAiOperationKey(operation)
      if (operationKey && tx.appliedOpIds.has(operationKey)) {
        return
      }
      if (operation.op === 'done') {
        tx.done = true
        if (operationKey) {
          tx.appliedOpIds.add(operationKey)
        }
        return
      }
      this.assertAiOperationPermission(operation)
      if (operation.op === 'add_child') {
        if (tx.createdNodeIds[operation.id]) {
          if (operationKey) {
            tx.appliedOpIds.add(operationKey)
          }
          return
        }
        const parentUid = this.resolveAiOperationRef(operation.parent)
        if (!parentUid) {
          return this.skipAiOperation(operation, 'missing-parent-ref')
        }
        this.assertAiOperationNodeInScope(parentUid)
        const parentRef = this.findAiDataNodeByUid(parentUid)
        if (!parentRef) {
          return this.skipAiOperation(operation, 'parent-not-found', {
            parentUid
          })
        }
        const uid = createUid()
        const child = this.cloneJson(operation.node)
        child.data.uid = uid
        child.children = Array.isArray(child.children) ? child.children : []
        this.ensureAiNodeDataUid(child)
        if (!Array.isArray(parentRef.dataNode.children)) {
          parentRef.dataNode.children = []
        }
        parentRef.dataNode.children.push(child)
        this.markAiDataNodeNeedUpdate(parentUid)
        tx.createdNodeIds[operation.id] = uid
        tx.createdUidSet.add(uid)
        if (operationKey) {
          tx.appliedOpIds.add(operationKey)
        }
        tx.appliedCount += 1
        return true
      }
      if (operation.op === 'delete_node') {
        const uid = this.resolveAiOperationRef(operation.id)
        if (!uid) {
          return this.skipAiOperation(operation, 'missing-delete-ref')
        }
        if (uid === tx.targetUid) {
          throw new Error('ai operation cannot delete current node')
        }
        this.assertAiOperationNodeInScope(uid)
        const targetRef = this.findAiDataNodeByUid(uid)
        if (!targetRef || !targetRef.parent || targetRef.index < 0) {
          return this.skipAiOperation(operation, 'delete-target-not-found', {
            uid
          })
        }
        targetRef.parent.children.splice(targetRef.index, 1)
        if (targetRef.parent.data && targetRef.parent.data.uid) {
          this.markAiDataNodeNeedUpdate(targetRef.parent.data.uid)
        }
        if (operationKey) {
          tx.appliedOpIds.add(operationKey)
        }
        tx.appliedCount += 1
        return true
      }
      const uid = this.resolveAiOperationRef(operation.id)
      if (!uid) {
        return this.skipAiOperation(operation, 'missing-update-ref')
      }
      this.assertAiOperationNodeInScope(uid)
      const targetRef = this.findAiDataNodeByUid(uid)
      if (!targetRef) {
        return this.skipAiOperation(operation, 'update-target-not-found', {
          uid
        })
      }
      Object.keys(operation.data).forEach(key => {
        targetRef.dataNode.data[key] = operation.data[key]
      })
      this.markAiDataNodeNeedUpdate(uid)
      if (operationKey) {
        tx.appliedOpIds.add(operationKey)
      }
      tx.appliedCount += 1
      return true
    },

    summarizeAiOperation(operation) {
      const text =
        operation && operation.data && operation.data.text
          ? operation.data.text
          : operation && operation.node && operation.node.data
            ? operation.node.data.text
            : ''
      const richTextSummary = text
        ? summarizeRichTextJson(quillHtmlToRichTextJson(text))
        : null
      return {
        op: operation && operation.op,
        id: operation && operation.id,
        parent: operation && operation.parent,
        hasText: !!text,
        textLen: text ? String(text).length : 0,
        richTextSummary
      }
    },

    applyAiOperationStreamContent(content, final = false) {
      const tx = this._aiOpTransaction
      if (!tx) {
        return {
          appliedCount: 0,
          done: false
        }
      }
      const result = parseAiOperationStreamChunk(content, {
        offset: tx.offset,
        final,
        allowInlineStyles: tx.permission.allowInlineStyles,
        allowedOps: tx.permission.allowedOps
      })
      if (result.operations.length > 0) {
        mindmapDevDebug('mindmap-ai-opstream', 'parsed operation batch', {
          final,
          fromOffset: tx.offset,
          toOffset: result.offset,
          operationCount: result.operations.length,
          allowInlineStyles: tx.permission.allowInlineStyles,
          allowedOps: tx.permission.allowedOps,
          operations: result.operations.map(operation =>
            this.summarizeAiOperation(operation)
          )
        })
      }
      this.runAiOperationMutation(() => {
        let hasChanged = false
        result.operations.forEach(operation => {
          if (this.applyAiOperation(operation)) {
            hasChanged = true
          }
        })
        if (hasChanged) {
          this.mindMap.render()
        }
        return hasChanged
      })
      tx.offset = result.offset
      return {
        appliedCount: result.operations.length,
        done: tx.done
      }
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
      const styledExample = [
        '{"op":"update_current","text":{"paragraphs":[{"spans":[{"text":"需要高亮的文字","background":"#fff2cc"}]}]}}',
        '{"op":"update_current","text":{"paragraphs":[{"spans":[{"text":"下划线","underline":true},{"text":" 删除线","strike":true},{"text":" 红色文字","color":"#d93025"}]}]}}',
        '{"op":"update_current","text":{"paragraphs":[{"align":"center","spans":[{"text":"居中标题"}]}]}}'
      ].join('\n')
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
  <streaming_rule>只输出 NDJSON；每一行必须是一个完整 JSON 操作对象。不要输出 Markdown、代码块、解释文字或整体 JSON 数组。</streaming_rule>
  <operations>
${protocol.operations}
  </operations>
  <permission_rules>
${protocol.permissionRules}
  </permission_rules>
</operation_protocol>
${contextReferenceXml}
<edit_intent_rules>
  如果 user_requirement 只是要求调整样式、格式、颜色、高亮、下划线、缩进或空格，不要改写、删除或新增任何文本内容。
  纯样式修改时必须保留原文；需要修改哪个节点，就输出该节点完整原文对应的 text.paragraphs/spans，只在对应 span 上增减样式字段。
  如果要求“全部/所有/整体”应用某种样式，必须对 edit_scope 范围内每个需要保留的节点分别输出 update_current 或 update_node，并给每个对应 span 都写上该样式字段。
  视觉参考只使用 selected_node.current_node_style 和当前选中节点 current；不要根据整张图或子节点推断目标样式。需要预览/渲染效果时，只把 current 当作唯一目标节点。
  如果 user_requirement 要求“保持当前样式/参考当前节点样式”，应尽量保留 current_node_style 对应的视觉特征，只调整用户明确要求修改的文字或富文本样式字段。
  如果 user_requirement 包含层级、列表或大纲内容，且当前允许 add_child，应优先用 add_child 创建真实子节点；不要用 paragraph.indent 或 span.text 前导空格模拟思维导图层级。
  如果当前不允许 add_child，则用无前导空格的普通段落表达层级内容；不要输出用于排版的前导空格、制表符或 HTML 实体。
  新增、删除、更新子节点等能力只以 operation_protocol.permission_rules 和 operations 为准。
</edit_intent_rules>
<format_reference>
  <node_fields>
    <text required="true">使用 paragraphs/spans 表达，最终会转换为 Quill HTML。</text>
    <note optional="true">普通文本备注。</note>
    <hyperlink optional="true">URL 字符串。</hyperlink>
${protocol.childrenField}
  </node_fields>
  <rich_text>
    text 必须是对象：{"paragraphs":[{"spans":[{"text":"文本"}]}]}。
    paragraph 表示段落，可带 align 和 indent；span 表示一段连续文本，可带文字样式。
    禁止输出 HTML、Markdown、class、style 字符串；不要把 rich_text_json 原样当字符串输出。
  </rich_text>
  <style_fields>
    paragraph.align 使用 "left"、"center"、"right" 表示段落对齐。
    paragraph.indent 使用 0-8 的整数表示段落缩进层级，会转换为 Quill 的 ql-indent-N；仅在用户明确要求段落缩进时使用，不要用它表达思维导图层级、列表层级或大纲层级。
    span.bold、span.italic、span.underline、span.strike 使用 true 表示加粗、斜体、下划线、删除线。
    span.color 使用 "#RRGGBB" 表示文字颜色；span.background 使用 "#RRGGBB" 表示高亮/背景色。
    span.font 表示字体；span.size 使用 px，例如 "16px"。
    样式只作用于带该字段的 span；如果多个文字片段需要同一种样式，请给每个对应 span 都写上同样的字段。
    动词高亮用 span.background；形容词下划线用 span.underline:true。
    span.text 只能包含用户可见的纯文本，不能包含 &lt;u&gt;、&lt;mark&gt;、&lt;strong&gt;、&lt;span&gt;、**加粗**、__下划线__ 等任何标记。
    span.text 必须输出普通字符，不要输出 HTML 实体；例如输出 "Star & Fork"，不要输出 "Star &amp; Fork"。
    span.text 不要包含用于排版的前导空格或制表符；只有用户明确要求保留原始空白时，才保留正文中的连续普通空格。
  </style_fields>
  <default_style_rule>
    默认不要输出 align、bold、italic、underline、strike、color、background、font、size 等样式字段。
    selected_node.rich_text_json 是当前节点已有富文本结构；如果只是改写文字，需尽量保留原有 paragraph.align、paragraph.indent，以及 span 上的高亮、加粗、下划线、删除线、颜色、字号等样式字段。
    未指定样式且原文无样式时只返回纯文本 span，系统会在创建节点时自动使用当前主题默认样式。
    仅当 user_requirement 要求新增或调整某种样式时，才可新增或改变对应样式字段。
  </default_style_rule>
  <unsupported>不要输出 Markdown、HTML、表格、代码块、引用块或任务列表；所有样式必须使用上面列出的 JSON 字段表达。</unsupported>
</format_reference>
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
                this.endAiOperationTransaction()
              } catch (streamError) {
                if (tx && tx.appliedCount > 0) {
                  throw streamError
                }
                this.endAiOperationTransaction()
              }
              const result = parseAiOrganizeJson(content, {
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
      const targetRef = this.findAiDataNodeByUid(this.beingOrganizeNodeUid)
      if (!targetRef) {
        throw new Error('target node missing')
      }
      this.runAiOperationMutation(() => {
        const currentData = result.current.data
        const children = result.children || []
        Object.keys(currentData).forEach(key => {
          targetRef.dataNode.data[key] = currentData[key]
        })
        this.markAiDataNodeNeedUpdate(this.beingOrganizeNodeUid)
        if (children.length > 0) {
          if (!Array.isArray(targetRef.dataNode.children)) {
            targetRef.dataNode.children = []
          }
          targetRef.dataNode.children.push(
            ...children.map(child => this.ensureAiNodeDataUid(this.cloneJson(child)))
          )
          this.markAiDataNodeNeedUpdate(this.beingOrganizeNodeUid)
        }
        this.mindMap.render()
        return true
      })
    }
  }
}
</script>

