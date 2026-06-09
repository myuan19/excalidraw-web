<template>
  <div>
    <AiConfigDialog v-model="aiConfigDialogVisible"></AiConfigDialog>
    <!-- AI润色当前节点 -->
    <el-dialog
      class="aiOrganizeDialog"
      :title="$t('ai.organizeCurrentNode')"
      :visible.sync="organizeDialogVisible"
      width="780px"
      append-to-body
    >
      <div class="aiOrganizeBox">
        <div class="aiOrganizeSidebar">
          <div class="defaultActionSection">
            <div class="sidebarBlockTitle">{{ $t('ai.defaultPolishActions') }}</div>
            <div
              class="defaultActionCard"
              :class="{ active: activeDefaultActionId === action.id }"
              v-for="action in organizeDefaultActions"
              :key="action.id"
              @click="selectDefaultAction(action)"
            >
              <div class="defaultActionName">{{ action.name }}</div>
              <div class="defaultActionDesc">{{ action.desc }}</div>
              <div class="defaultActionMeta">
                <span
                  class="metaTag"
                  :class="{ enabled: action.createChildren }"
                >
                  {{
                    action.createChildren
                      ? $t('ai.childrenEnabled')
                      : $t('ai.childrenDisabled')
                  }}
                </span>
              </div>
            </div>
          </div>
          <div class="sidebarConfigSection">
            <div class="sidebarBlockTitle">{{ $t('ai.organizeSettings') }}</div>
            <div class="sidebarSwitchRow">
              <div>
                <div class="settingName">{{ $t('ai.allowCreateChildren') }}</div>
                <div class="settingTip">{{ $t('ai.allowCreateChildrenTip') }}</div>
              </div>
              <el-switch v-model="organizeCreateChildren"></el-switch>
            </div>
            <div class="sidebarSwitchRow">
              <div>
                <div class="settingName">{{ $t('ai.allowDeleteNodes') }}</div>
                <div class="settingTip">{{ $t('ai.allowDeleteNodesTip') }}</div>
              </div>
              <el-switch
                v-model="organizeAllowDeleteNodes"
                :disabled="organizeEditScope !== 'subtree'"
              ></el-switch>
            </div>
          </div>
          <div
            class="presetSectionHeader"
            @click="toggleOrganizePresetsExpanded"
          >
            <div class="presetSectionTitle">
              <span class="titleText">{{ $t('ai.savedPromptPresets') }}</span>
              <span class="titleTip">{{ $t('ai.savedPromptPresetsGlobalTip') }}</span>
            </div>
            <i
              class="presetSectionToggle"
              :class="
                organizePresetsExpanded
                  ? 'el-icon-arrow-up'
                  : 'el-icon-arrow-down'
              "
            ></i>
          </div>
          <div class="presetPanel" v-show="organizePresetsExpanded">
            <div class="presetList">
              <div
                class="presetCard"
                :class="{
                  active: activePromptPresetId === preset.id,
                  expanded: expandedPresetPromptId === preset.id
                }"
                v-for="preset in organizePromptPresets"
                :key="preset.id"
              >
                <div class="presetCardHead">
                  <i
                    class="presetExpandIcon el-icon-arrow-right"
                    :class="{ rotated: expandedPresetPromptId === preset.id }"
                    @click.stop="togglePresetPromptExpand(preset)"
                  ></i>
                  <span
                    class="presetName"
                    @click="selectPromptPreset(preset)"
                    >{{ preset.name }}</span
                  >
                  <i
                    class="el-icon-delete presetDelete"
                    @click.stop="deletePromptPreset(preset)"
                  ></i>
                </div>
                <div
                  class="presetCardBody"
                  v-show="expandedPresetPromptId === preset.id"
                >
                  {{ preset.prompt }}
                </div>
              </div>
              <div
                class="emptyPreset"
                v-if="organizePromptPresets.length <= 0"
              >
                {{ $t('ai.noPromptPresets') }}
              </div>
            </div>
            <div class="presetSaveBlock">
              <el-input
                size="small"
                v-model="promptPresetName"
                :placeholder="$t('ai.promptPresetNamePlaceholder')"
              ></el-input>
              <el-button size="small" @click="savePromptPreset">{{
                $t('ai.saveAsPromptPreset')
              }}</el-button>
            </div>
          </div>
        </div>
        <div class="aiOrganizeMain">
          <div class="nodePreviewSection">
            <div class="sectionLabel">{{ $t('ai.currentNodePreview') }}</div>
            <div class="nodePreviewStage">
              <div
                class="nodePreviewChip"
                :style="getOrganizeNodePreviewBoxStyle()"
              >
                <div
                  v-if="organizePreviewHtml"
                  class="nodePreviewRichText"
                  v-html="organizePreviewHtml"
                ></div>
                <div v-else class="nodePreviewEmpty">
                  {{ $t('ai.emptyCurrentNode') }}
                </div>
              </div>
            </div>
          </div>
          <div class="requirementSection">
            <div class="sectionLabel">{{ $t('ai.modifyRequirement') }}</div>
            <div class="sectionDesc">{{ $t('ai.organizeSettingsDesc') }}</div>
            <el-input
              type="textarea"
              :rows="4"
              v-model="organizeRequirement"
              :placeholder="$t('ai.modifyRequirementPlaceholder')"
            ></el-input>
          </div>
          <div class="aiStreamingSection" v-if="isAiCreating || aiStreamingContent">
            <div class="sectionLabel">{{ $t('ai.streamingPreview') }}</div>
            <div class="sectionDesc">{{ $t('ai.streamingPreviewTip') }}</div>
            <pre class="aiStreamingContent">{{
              aiStreamingContent || $t('ai.waitingForAiOutput')
            }}</pre>
          </div>
          <div class="configTip" v-if="!hasAiConfig">
            {{ $t('ai.mindMapAiConfigMissingTip') }}
            <el-button type="text" @click="showAiConfigDialog">{{
              $t('ai.openAISettings')
            }}</el-button>
          </div>
        </div>
      </div>
      <div slot="footer" class="dialog-footer">
        <el-button @click="closeAiOrganizeDialog">{{
          $t('ai.cancel')
        }}</el-button>
        <el-button type="primary" @click="confirmAiOrganize">{{
          $t('ai.confirm')
        }}</el-button>
      </div>
    </el-dialog>
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
  deleteMindMapOrganizePromptPreset,
  listMindMapOrganizePromptPresets,
  saveMindMapOrganizePromptPreset
} from '@/utils/aiPromptPresets'
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

      organizeDialogVisible: false,
      organizeEditScope: AI_EDIT_SCOPE.CURRENT,
      organizeCreateChildren: false,
      organizeAllowDeleteNodes: false,
      organizeContextCharLimit: AI_CONTEXT_CHAR_LIMIT.DEFAULT,
      organizePreviewText: '',
      organizePreviewHtml: '',
      organizeRequirement: '',
      organizePromptPresets: [],
      organizePresetsExpanded: true,
      expandedPresetPromptId: '',
      activePromptPresetId: '',
      promptPresetName: '',
      promptPresetsLoaded: false,
      beingOrganizeNodeUid: '',
      organizePreviewStyle: {},
      activeDefaultActionId: 'organize-current',
      aiStreamingContent: '',
      isHostMode: isHostMode()
    }
  },
  computed: {
    ...mapState(['aiConfig']),
    organizeDefaultActions() {
      return [
        {
          id: 'organize-current',
          name: this.$t('ai.defaultActionOrganizeCurrent'),
          desc: this.$t('ai.defaultActionOrganizeCurrentDesc'),
          requirement: '',
          createChildren: false
        },
        {
          id: 'split-children',
          name: this.$t('ai.defaultActionSplitChildren'),
          desc: this.$t('ai.defaultActionSplitChildrenDesc'),
          requirement: this.$t('ai.defaultActionSplitChildrenPrompt'),
          createChildren: true
        },
        {
          id: 'shorten-title',
          name: this.$t('ai.defaultActionShortenTitle'),
          desc: this.$t('ai.defaultActionShortenTitleDesc'),
          requirement: this.$t('ai.defaultActionShortenTitlePrompt'),
          createChildren: false
        }
      ]
    },
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
    },
    organizeCreateChildren(value) {
      if (value) {
        this.organizeEditScope = AI_EDIT_SCOPE.SUBTREE
      }
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

    async loadPromptPresets() {
      try {
        this.organizePromptPresets = await listMindMapOrganizePromptPresets()
        this.promptPresetsLoaded = true
      } catch (error) {
        console.log(error)
        mindmapDevDebug('mindmap-ai-prompt', 'load presets failed', {
          message: error && error.message ? error.message : String(error)
        })
      }
    },

    toggleOrganizePresetsExpanded() {
      this.organizePresetsExpanded = !this.organizePresetsExpanded
    },

    togglePresetPromptExpand(preset) {
      this.expandedPresetPromptId =
        this.expandedPresetPromptId === preset.id ? '' : preset.id
    },

    updateOrganizeNodePreview(node) {
      if (!node) {
        this.organizePreviewText = ''
        this.organizePreviewHtml = ''
        this.organizePreviewStyle = {}
        return
      }
      this.organizePreviewText = this.getNodePlainText(node)
      this.organizePreviewHtml = node.getData('text') || ''
      this.organizePreviewStyle = this.buildOrganizeNodePreviewBoxStyle(node)
    },

    buildOrganizeNodePreviewBoxStyle(node) {
      if (!node || !node.style) {
        return {}
      }
      const style = node.style
      const fillColor = style.merge('fillColor')
      const borderColor = style.merge('borderColor')
      const borderWidth = style.merge('borderWidth') || 0
      const borderRadius = style.merge('borderRadius') || 5
      const color = style.merge('color')
      const fontSize = style.merge('fontSize')
      const fontFamily = style.merge('fontFamily')
      const fontWeight = style.merge('fontWeight') || 'normal'
      const paddingX = style.merge('paddingX') || 12
      const paddingY = style.merge('paddingY') || 8
      const gradientStyle = style.merge('gradientStyle')
      const boxStyle = {
        color,
        fontSize: `${fontSize}px`,
        fontFamily,
        fontWeight,
        borderColor: borderColor || 'transparent',
        borderWidth: `${borderWidth}px`,
        borderStyle: 'solid',
        borderRadius: `${borderRadius}px`,
        padding: `${paddingY}px ${paddingX}px`
      }
      if (gradientStyle) {
        const startColor = style.merge('startColor')
        const endColor = style.merge('endColor')
        boxStyle.background = `linear-gradient(to right, ${startColor}, ${endColor})`
      } else if (fillColor && fillColor !== 'transparent') {
        boxStyle.backgroundColor = fillColor
      } else {
        boxStyle.backgroundColor = '#ffffff'
      }
      return boxStyle
    },

    getOrganizeNodePreviewBoxStyle() {
      return this.organizePreviewStyle
    },

    getBeingOrganizeNode() {
      if (this.beingOrganizeNodeUid && this.mindMap && this.mindMap.renderer) {
        return this.mindMap.renderer.findNodeByUid(this.beingOrganizeNodeUid)
      }
      return this._beingOrganizeNode
    },

    selectPromptPreset(preset) {
      this.activeDefaultActionId = ''
      this.activePromptPresetId = preset.id
      this.promptPresetName = preset.name || ''
      this.organizeRequirement = preset.prompt || ''
      if (
        preset.options &&
        (preset.options.scope === AI_EDIT_SCOPE.CURRENT ||
          preset.options.scope === AI_EDIT_SCOPE.SUBTREE)
      ) {
        this.organizeEditScope = preset.options.scope
        this.organizeCreateChildren = !!preset.options.allowCreateChildren
      } else if (
        preset.options &&
        Object.prototype.hasOwnProperty.call(
          preset.options,
          'organizeCreateChildren'
        )
      ) {
        this.organizeCreateChildren = !!preset.options.organizeCreateChildren
        this.organizeEditScope = this.organizeCreateChildren
          ? AI_EDIT_SCOPE.SUBTREE
          : AI_EDIT_SCOPE.CURRENT
      }
      if (preset.options && preset.options.contextCharLimit) {
        this.organizeContextCharLimit = normalizeContextCharLimit(
          preset.options.contextCharLimit
        )
      }
      this.organizeAllowDeleteNodes = !!(
        preset.options && preset.options.allowDeleteNodes
      )
      this.expandedPresetPromptId = preset.id
      mindmapDevDebug('mindmap-ai-prompt', 'select preset', {
        id: preset.id,
        name: preset.name,
        promptLen: this.organizeRequirement.length,
        scope: this.organizeEditScope,
        createChildren: this.organizeCreateChildren,
        allowDeleteNodes: this.organizeAllowDeleteNodes,
        contextCharLimit: this.organizeContextCharLimit
      })
    },

    selectDefaultAction(action) {
      this.activeDefaultActionId = action.id
      this.activePromptPresetId = ''
      this.expandedPresetPromptId = ''
      this.promptPresetName = ''
      this.organizeRequirement = action.requirement || ''
      this.organizeEditScope = action.createChildren
        ? AI_EDIT_SCOPE.SUBTREE
        : AI_EDIT_SCOPE.CURRENT
      this.organizeCreateChildren = !!action.createChildren
      this.organizeAllowDeleteNodes = false
      mindmapDevDebug('mindmap-ai-prompt', 'select default action', {
        id: action.id,
        scope: this.organizeEditScope,
        createChildren: this.organizeCreateChildren,
        allowDeleteNodes: this.organizeAllowDeleteNodes,
        requirementLen: this.organizeRequirement.length
      })
    },

    async savePromptPreset() {
      const prompt = this.organizeRequirement.trim()
      if (!prompt) {
        this.$message.warning(this.$t('ai.modifyRequirementRequired'))
        return
      }
      const name =
        this.promptPresetName.trim() ||
        prompt.slice(0, 20) ||
        this.$t('ai.unnamedPromptPreset')
      try {
        const saved = await saveMindMapOrganizePromptPreset({
          id: this.activePromptPresetId || undefined,
          name,
          prompt,
          options: {
            scope: this.organizeEditScope,
            allowCreateChildren:
              this.organizeEditScope === AI_EDIT_SCOPE.SUBTREE &&
              !!this.organizeCreateChildren,
            allowDeleteNodes:
              this.organizeEditScope === AI_EDIT_SCOPE.SUBTREE &&
              !!this.organizeAllowDeleteNodes,
            contextCharLimit: normalizeContextCharLimit(
              this.organizeContextCharLimit
            )
          },
          sort_index: this.organizePromptPresets.findIndex(item => {
            return item.id === this.activePromptPresetId
          })
        })
        const index = this.organizePromptPresets.findIndex(item => {
          return item.id === saved.id
        })
        if (index >= 0) {
          this.$set(this.organizePromptPresets, index, saved)
        } else {
          this.organizePromptPresets.push(saved)
        }
        this.selectPromptPreset(saved)
        this.$message.success(this.$t('ai.promptPresetSaved'))
      } catch (error) {
        console.log(error)
        this.$message.error(this.$t('ai.promptPresetSaveFailed'))
      }
    },

    async deletePromptPreset(preset) {
      try {
        await deleteMindMapOrganizePromptPreset(preset.id)
        this.organizePromptPresets = this.organizePromptPresets.filter(item => {
          return item.id !== preset.id
        })
        if (this.activePromptPresetId === preset.id) {
          this.activePromptPresetId = ''
          this.promptPresetName = ''
          this.organizeRequirement = ''
        }
        this.$message.success(this.$t('ai.promptPresetDeleted'))
      } catch (error) {
        console.log(error)
        this.$message.error(this.$t('ai.promptPresetDeleteFailed'))
      }
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
      } else {
        this.showAiOrganizeDialog(arg)
      }
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

    showAiOrganizeDialog(node) {
      if (!node || node.isGeneralization) {
        mindmapDevDebug('mindmap-ai', 'AiCreate.showAiOrganizeDialog ignored', {
          hasNode: !!node,
          isGeneralization: !!(node && node.isGeneralization)
        })
        return
      }
      this._beingOrganizeNode = node
      this.beingOrganizeNodeUid = node.getData('uid') || ''
      this.organizeEditScope = AI_EDIT_SCOPE.CURRENT
      this.organizeCreateChildren = false
      this.organizeAllowDeleteNodes = false
      this.organizeContextCharLimit = AI_CONTEXT_CHAR_LIMIT.DEFAULT
      this.activeDefaultActionId = 'organize-current'
      this.aiStreamingContent = ''
      this.updateOrganizeNodePreview(node)
      if (!this.promptPresetsLoaded) {
        this.loadPromptPresets()
      }
      mindmapDevDebug('mindmap-ai', 'AiCreate.showAiOrganizeDialog', {
        nodeUid: this.beingOrganizeNodeUid,
        previewLen: this.organizePreviewText.length,
        promptPresetsLoaded: this.promptPresetsLoaded,
        hasAiConfig: this.hasAiConfig,
        ...this.getAiConfigDebugSummary()
      })
      this.organizeDialogVisible = true
    },

    closeAiOrganizeDialog() {
      if (this.isAiCreating) {
        this.stopCreate()
      }
      this.organizeDialogVisible = false
      this._beingOrganizeNode = null
      this.beingOrganizeNodeUid = ''
      this.organizePreviewText = ''
      this.organizePreviewHtml = ''
      this.organizePreviewStyle = {}
      this.organizeEditScope = AI_EDIT_SCOPE.CURRENT
      this.organizeCreateChildren = false
      this.organizeAllowDeleteNodes = false
      this.organizeContextCharLimit = AI_CONTEXT_CHAR_LIMIT.DEFAULT
      this.activePromptPresetId = ''
      this.expandedPresetPromptId = ''
      this.activeDefaultActionId = 'organize-current'
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
        '{"op":"update_current","text":{"paragraphs":[{"indent":1,"spans":[{"text":"    保留前导空格和连续  空格"}]}]}}'
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
    paragraph.indent 使用 0-8 的整数表示段落缩进层级，会转换为 Quill 的 ql-indent-N。
    span.bold、span.italic、span.underline、span.strike 使用 true 表示加粗、斜体、下划线、删除线。
    span.color 使用 "#RRGGBB" 表示文字颜色；span.background 使用 "#RRGGBB" 表示高亮/背景色。
    span.font 表示字体；span.size 使用 px，例如 "16px"。
    样式只作用于带该字段的 span；如果多个文字片段需要同一种样式，请给每个对应 span 都写上同样的字段。
    动词高亮用 span.background；形容词下划线用 span.underline:true。
    span.text 只能包含用户可见的纯文本，不能包含 &lt;u&gt;、&lt;mark&gt;、&lt;strong&gt;、&lt;span&gt;、**加粗**、__下划线__ 等任何标记。
    前导空格、连续空格、制表符请直接写在 span.text 中，不要用 Markdown、HTML 或转义说明代替。
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
              this.closeAiOrganizeDialog()
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
              this.closeAiOrganizeDialog()
            }
          },
          () => {
            this.rollbackAiOperationTransaction('request-error')
            this.resetOnAiCreatingStop()
            this.closeAiOrganizeDialog()
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
        if (children.length > 0) {
          if (!Array.isArray(targetRef.dataNode.children)) {
            targetRef.dataNode.children = []
          }
          targetRef.dataNode.children.push(
            ...children.map(child => this.ensureAiNodeDataUid(this.cloneJson(child)))
          )
        }
        this.mindMap.render()
        return true
      })
    }
  }
}
</script>

<style lang="less" scoped>
.aiOrganizeDialog {
  /deep/ .el-dialog__body {
    padding: 12px 20px;
  }
}

.aiOrganizeBox {
  display: flex;
  min-height: 360px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  overflow: hidden;

  .aiOrganizeSidebar {
    width: 240px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: #f7f8fa;
    border-right: 1px solid #ebeef5;
  }

  .presetSectionHeader {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    padding: 14px 12px;
    cursor: pointer;
    user-select: none;

    &:hover {
      background: #f0f2f5;
    }
  }

  .defaultActionSection,
  .sidebarConfigSection {
    padding: 12px;
    border-bottom: 1px solid #ebeef5;
  }

  .sidebarBlockTitle {
    margin-bottom: 8px;
    color: #303133;
    font-size: 13px;
    font-weight: 600;
  }

  .defaultActionCard {
    margin-bottom: 8px;
    padding: 10px;
    background: #fff;
    border: 1px solid #e4e7ed;
    border-radius: 6px;
    cursor: pointer;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;

    &:hover,
    &.active {
      border-color: #409eff;
      box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.12);
    }
  }

  .defaultActionName {
    color: #303133;
    font-size: 13px;
    font-weight: 500;
  }

  .defaultActionDesc {
    margin-top: 4px;
    color: #909399;
    font-size: 12px;
    line-height: 1.45;
  }

  .defaultActionMeta {
    margin-top: 8px;
  }

  .metaTag {
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 6px;
    color: #909399;
    font-size: 11px;
    background: #f4f4f5;
    border-radius: 999px;

    &.enabled {
      color: #409eff;
      background: #ecf5ff;
    }
  }

  .sidebarSwitchRow {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }

  .presetSectionTitle {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .titleText {
    color: #303133;
    font-size: 13px;
    font-weight: 600;
  }

  .titleTip {
    color: #909399;
    font-size: 11px;
    line-height: 1.4;
  }

  .presetSectionToggle {
    margin-top: 2px;
    color: #909399;
    font-size: 14px;
    flex-shrink: 0;
  }

  .presetPanel {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    padding: 0 12px 12px;
  }

  .presetList {
    flex: 1;
    min-height: 0;
    max-height: 240px;
    overflow: auto;
  }

  .presetCard {
    margin-bottom: 8px;
    border: 1px solid #e4e7ed;
    border-radius: 6px;
    background: #fff;
    overflow: hidden;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;

    &.active {
      border-color: #409eff;
      box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.12);
    }
  }

  .presetCardHead {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
  }

  .presetExpandIcon {
    color: #909399;
    font-size: 12px;
    cursor: pointer;
    transition: transform 0.2s ease;

    &.rotated {
      transform: rotate(90deg);
    }
  }

  .presetName {
    flex: 1;
    min-width: 0;
    color: #303133;
    font-size: 13px;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .presetDelete {
    color: #c0c4cc;
    cursor: pointer;
    flex-shrink: 0;

    &:hover {
      color: #f56c6c;
    }
  }

  .presetCardBody {
    padding: 0 10px 10px 28px;
    color: #606266;
    font-size: 12px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .emptyPreset {
    padding: 12px 4px;
    color: #c0c4cc;
    font-size: 12px;
    line-height: 1.5;
  }

  .presetSaveBlock {
    display: flex;
    gap: 8px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid #ebeef5;
  }

  .aiOrganizeMain {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 16px;
    gap: 16px;
  }

  .sectionLabel {
    margin-bottom: 8px;
    color: #303133;
    font-size: 13px;
    font-weight: 600;
  }

  .sectionDesc {
    margin-bottom: 8px;
    color: #909399;
    font-size: 12px;
    line-height: 1.5;
  }

  .nodePreviewSection {
    flex-shrink: 0;
  }

  .nodePreviewStage {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 120px;
    padding: 18px 16px;
    background:
      radial-gradient(circle at 1px 1px, #e5e7eb 1px, transparent 0) 0 0 / 16px
        16px,
      #f8fafc;
    border: 1px solid #ebeef5;
    border-radius: 8px;
  }

  .nodePreviewChip {
    display: inline-block;
    max-width: 100%;
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);
  }

  .nodePreviewRichText {
    word-break: break-word;
    line-height: 1.4;

    /deep/ p {
      margin: 0;
    }

    /deep/ .ql-align-center {
      text-align: center;
    }

    /deep/ .ql-align-right {
      text-align: right;
    }
  }

  .nodePreviewEmpty {
    color: #909399;
    font-size: 13px;
    line-height: 1.5;
  }

  .requirementSection {
    flex-shrink: 0;
    min-height: 0;
  }

  .settingName {
    color: #303133;
    font-size: 13px;
    font-weight: 500;
  }

  .settingTip {
    margin-top: 4px;
    color: #909399;
    font-size: 12px;
    line-height: 1.4;
  }

  .aiStreamingSection {
    flex: 1;
    min-height: 0;
  }

  .aiStreamingContent {
    min-height: 100px;
    max-height: 180px;
    margin: 0;
    padding: 10px 12px;
    color: #606266;
    font-size: 12px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
    overflow: auto;
    background: #fbfdff;
    border: 1px solid #ebeef5;
    border-radius: 8px;
  }

  .configTip {
    color: #e6a23c;
    font-size: 12px;
    line-height: 1.5;
  }
}
</style>
