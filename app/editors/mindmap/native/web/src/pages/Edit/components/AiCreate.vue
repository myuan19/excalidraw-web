<template>
  <div>
    <!-- ai生成中添加一个透明层，防止期间用户进行操作 -->
    <div
      class="aiCreatingMask"
      ref="aiCreatingMaskRef"
      v-show="aiCreatingMaskVisible"
    >
      <el-button type="warning" class="btn" @click="stopCreate">{{
        $t('ai.stopGenerating')
      }}</el-button>
    </div>
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
            <div class="sidebarStatusList">
              <div class="sidebarStatusItem">
                <span>{{ $t('ai.currentChildrenSetting') }}</span>
                <strong>{{
                  organizeCreateChildren
                    ? $t('ai.childrenEnabled')
                    : $t('ai.childrenDisabled')
                }}</strong>
              </div>
              <div class="sidebarStatusItem">
                <span>{{ $t('ai.currentStyleSetting') }}</span>
                <strong>{{
                  hasExplicitInlineStyleRequirement()
                    ? $t('ai.customStyleEnabled')
                    : $t('ai.defaultThemeStyle')
                }}</strong>
              </div>
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
import { parseAiOrganizeJson } from '@/utils/aiTreeJson'
import {
  getAiOperationKey,
  parseAiOperationStreamChunk
} from '@/utils/aiOperationStream'
import { createUid, getStrWithBrFromHtml } from 'simple-mind-map/src/utils'
import { mapState } from 'vuex'
import AiConfigDialog from './AiConfigDialog.vue'
import { isHostMode, openAISettings } from '@/utils/hostBridge'
import { mindmapDevDebug } from '@/utils/mindmapDevDebug'
import {
  deleteMindMapOrganizePromptPreset,
  listMindMapOrganizePromptPresets,
  saveMindMapOrganizePromptPreset
} from '@/utils/aiPromptPresets'

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
  },
  data() {
    return {
      aiInstance: null,
      isAiCreating: false,
      aiCreatingMaskVisible: false,
      aiConfigDialogVisible: false,

      organizeDialogVisible: false,
      organizeCreateChildren: false,
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
    document.body.appendChild(this.$refs.aiCreatingMaskRef)
    mindmapDevDebug('mindmap-ai', 'AiCreate.mounted', {
      isHostMode: this.isHostMode,
      ...this.getAiConfigDebugSummary(),
      hasAiConfig: this.hasAiConfig
    })
  },
  beforeDestroy() {
    mindmapDevDebug('mindmap-ai', 'AiCreate.beforeDestroy unregister listeners')
    this.rollbackAiOperationTransaction('destroy')
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
      this.$bus.$emit('ai_create_status', { creating: this.isAiCreating })
    },

    broadcastAiStreamContent(content) {
      this.$bus.$emit('ai_stream_content', content || '')
    },

    // AI请求完成或出错后需要复位的数据
    resetOnAiCreatingStop() {
      this.aiCreatingMaskVisible = false
      this.isAiCreating = false
      this.aiInstance = null
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
      this.aiCreatingMaskVisible = false
      this.$message.success(this.$t('ai.stoppedGenerating'))
    },

    getNodePlainText(node) {
      if (!node) return ''
      return getStrWithBrFromHtml(node.getData('text') || '').trim()
    },

    getNodeNoteText(node) {
      if (!node) return ''
      return getStrWithBrFromHtml(node.getData('note') || '').trim()
    },

    getNodeChildrenSummary(node) {
      const children =
        node && node.nodeData && Array.isArray(node.nodeData.children)
          ? node.nodeData.children
          : []
      return children
        .slice(0, 12)
        .map((child, index) => {
          return `${index + 1}. [id=child-${index + 1}] ${getStrWithBrFromHtml(
            (child.data && child.data.text) || ''
          ).trim()}`
        })
        .filter(Boolean)
        .join('\n')
    },

    cloneJson(value) {
      return JSON.parse(JSON.stringify(value))
    },

    buildOriginalNodeRefMap(nodeData) {
      const refToUid = {}
      const allowedUidSet = new Set()
      const walk = (dataNode, ref) => {
        if (!dataNode || !dataNode.data || !dataNode.data.uid) {
          return
        }
        refToUid[ref] = dataNode.data.uid
        allowedUidSet.add(dataNode.data.uid)
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
      const refState = this.buildOriginalNodeRefMap(node.nodeData)
      if (this.mindMap.command && this.mindMap.command.pause) {
        this.mindMap.command.pause()
      }
      this._aiOpTransaction = {
        baseFullData,
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
      this.mindMap.renderer.setData(this.cloneJson(tx.baseFullData.root))
      this.mindMap.reRender()
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
      if (operation.op === 'add_child') {
        if (!this.organizeCreateChildren) {
          throw new Error('ai operation add_child not allowed')
        }
        if (tx.createdNodeIds[operation.id]) {
          if (operationKey) {
            tx.appliedOpIds.add(operationKey)
          }
          return
        }
        const parentUid = this.resolveAiOperationRef(operation.parent)
        this.assertAiOperationNodeInScope(parentUid)
        const parentNode = this.mindMap.renderer.findNodeByUid(parentUid)
        if (!parentNode) {
          throw new Error('ai operation parent missing')
        }
        const uid = createUid()
        const child = this.cloneJson(operation.node)
        child.data.uid = uid
        child.children = Array.isArray(child.children) ? child.children : []
        this.mindMap.execCommand('INSERT_MULTI_CHILD_NODE', [parentNode], [child])
        tx.createdNodeIds[operation.id] = uid
        tx.createdUidSet.add(uid)
        if (operationKey) {
          tx.appliedOpIds.add(operationKey)
        }
        tx.appliedCount += 1
        return
      }
      if (operation.op === 'delete_node') {
        const uid = this.resolveAiOperationRef(operation.id)
        if (uid === tx.targetUid) {
          throw new Error('ai operation cannot delete current node')
        }
        this.assertAiOperationNodeInScope(uid)
        const targetNode = this.mindMap.renderer.findNodeByUid(uid)
        if (!targetNode || !targetNode.parent) {
          throw new Error('ai operation delete target missing')
        }
        this.mindMap.execCommand('REMOVE_NODE', [targetNode])
        if (operationKey) {
          tx.appliedOpIds.add(operationKey)
        }
        tx.appliedCount += 1
        return
      }
      const uid = this.resolveAiOperationRef(operation.id)
      this.assertAiOperationNodeInScope(uid)
      const targetNode = this.mindMap.renderer.findNodeByUid(uid)
      if (!targetNode) {
        throw new Error('ai operation update target missing')
      }
      this.mindMap.renderer.setNodeDataRender(targetNode, operation.data)
      if (operationKey) {
        tx.appliedOpIds.add(operationKey)
      }
      tx.appliedCount += 1
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
        allowInlineStyles: this.hasExplicitInlineStyleRequirement()
      })
      result.operations.forEach(operation => {
        this.applyAiOperation(operation)
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
      this.expandedPresetPromptId = preset.id
      mindmapDevDebug('mindmap-ai-prompt', 'select preset', {
        id: preset.id,
        name: preset.name,
        promptLen: this.organizeRequirement.length
      })
    },

    selectDefaultAction(action) {
      this.activeDefaultActionId = action.id
      this.activePromptPresetId = ''
      this.expandedPresetPromptId = ''
      this.promptPresetName = ''
      this.organizeRequirement = action.requirement || ''
      this.organizeCreateChildren = !!action.createChildren
      mindmapDevDebug('mindmap-ai-prompt', 'select default action', {
        id: action.id,
        createChildren: this.organizeCreateChildren,
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

    hasExplicitInlineStyleRequirement() {
      const requirement = this.organizeRequirement.trim()
      if (!requirement) {
        return false
      }
      return /样式|格式|颜色|色彩|高亮|背景|加粗|粗体|斜体|下划线|删除线|字体|字号|大小|居中|居左|居右|对齐|bold|italic|underline|strike|color|background|font|size|align/i.test(
        requirement
      )
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
      this.organizeCreateChildren = arg.scope === 'subtree'
      this.organizeRequirement = arg.prompt || ''
      this.aiStreamingContent = ''
      mindmapDevDebug('mindmap-ai', 'AiCreate.handleSidebarAiOrganize', {
        nodeUid: this.beingOrganizeNodeUid,
        scope: arg.scope,
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
      this.organizeCreateChildren = false
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
      this.organizeCreateChildren = false
      this.activePromptPresetId = ''
      this.expandedPresetPromptId = ''
      this.activeDefaultActionId = 'organize-current'
      this.aiStreamingContent = ''
    },

    buildAiOrganizePrompt(node) {
      const currentText = this.escapePromptXml(this.getNodePlainText(node))
      const note = this.escapePromptXml(this.getNodeNoteText(node))
      const childrenSummary = this.escapePromptXml(
        this.getNodeChildrenSummary(node)
      )
      const requirement = this.escapePromptXml(this.organizeRequirement.trim())
      const allowCreateChildren = this.organizeCreateChildren ? 'true' : 'false'
      const allowInlineStyles = this.hasExplicitInlineStyleRequirement()
        ? 'true'
        : 'false'
      return `<mindmap_ai_task>
<task>整理当前 MindMap 节点内容，使表达更清晰、简洁、适合思维导图阅读。</task>
<user_requirement>${requirement || '请按通用整理要求优化当前节点。'}</user_requirement>
<selected_node>
  <id>current</id>
  <text>${currentText}</text>
  <note>${note}</note>
  <children_summary>${childrenSummary || '无'}</children_summary>
</selected_node>
<mode>
  <allow_create_children>${allowCreateChildren}</allow_create_children>
  <allow_inline_styles>${allowInlineStyles}</allow_inline_styles>
</mode>
<operation_protocol>
  <streaming_rule>只输出 NDJSON；每一行必须是一个完整 JSON 操作对象。不要输出 Markdown、代码块、解释文字或整体 JSON 数组。</streaming_rule>
  <operations>
    <operation name="update_current">更新当前选中节点。字段：{"op":"update_current","text":{"paragraphs":[{"spans":[{"text":"整理后的标题"}]}]},"note":"","hyperlink":""}</operation>
    <operation name="add_child">新增子节点，仅 allow_create_children 为 true 时允许。字段：{"op":"add_child","id":"ai-1","parent":"current","text":{"paragraphs":[{"spans":[{"text":"子节点"}]}]}}</operation>
    <operation name="update_node">更新 current、children_summary 中列出的 child-*，或本次 add_child 创建的 ai-*。字段：{"op":"update_node","id":"child-1","text":{"paragraphs":[{"spans":[{"text":"更新后的节点"}]}]}}</operation>
    <operation name="delete_node">删除 children_summary 中列出的 child-*，或本次 add_child 创建的 ai-*；禁止删除 current 本身。字段：{"op":"delete_node","id":"child-1"}</operation>
    <operation name="done">所有修改完成后最后输出一行：{"op":"done"}</operation>
  </operations>
  <scope_rule>所有 update_node、add_child、delete_node 只能作用于 current 以及其子节点范围内的引用；不得操作其它节点；delete_node 不得删除 current 本身。</scope_rule>
  <create_children_rule>当 allow_create_children 为 false 时，不得输出 add_child；如需拆分内容，请仅 update_current。</create_children_rule>
  <id_rule>add_child 的 id 必须稳定唯一，使用 ai-1、ai-2 这类临时 id；后续 update_node/delete_node 可引用这些临时 id。</id_rule>
</operation_protocol>
<format_reference>
  <node_fields>
    <text required="true">使用 paragraphs/spans 表达，最终会转换为 Quill HTML。</text>
    <note optional="true">普通文本备注。</note>
    <hyperlink optional="true">URL 字符串。</hyperlink>
    <children optional="true">仅 allow_create_children 为 true 时允许返回。</children>
  </node_fields>
  <rich_text>
    <paragraph>
      <span>文本</span>
      <span formula="LaTeX expression" />
    </paragraph>
  </rich_text>
  <default_style_rule>
    默认不要输出 align、bold、italic、underline、strike、color、background、font、size 等样式字段。
    未指定样式时只返回纯文本 span，系统会在创建节点时自动使用当前主题默认样式。
    仅当 user_requirement 明确要求某种样式，且 allow_inline_styles 为 true 时，才可返回对应样式字段。
  </default_style_rule>
  <unsupported>不要输出 Markdown、HTML、表格、代码块、引用块或任务列表。</unsupported>
</format_reference>
<output_examples>
{"op":"update_current","text":{"paragraphs":[{"spans":[{"text":"整理后的内容"}]}]}}
{"op":"add_child","id":"ai-1","parent":"current","text":{"paragraphs":[{"spans":[{"text":"子节点内容"}]}]}}
{"op":"done"}
</output_examples>
</mindmap_ai_task>`
    },

    async confirmAiOrganize() {
      const node = this.getBeingOrganizeNode()
      mindmapDevDebug('mindmap-ai', 'AiCreate.confirmAiOrganize start', {
        hasNode: !!node,
        nodeUid: this.beingOrganizeNodeUid,
        allowCreateChildren: this.organizeCreateChildren,
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
          allowCreateChildren: this.organizeCreateChildren,
          ...this.getAiConfigDebugSummary()
        })
        this.aiCreatingMaskVisible = true
        this.isAiCreating = true
        this.aiStreamingContent = ''
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
              allowCreateChildren: this.organizeCreateChildren
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
                allowChildren: this.organizeCreateChildren,
                allowInlineStyles: this.hasExplicitInlineStyleRequirement()
              })
              mindmapDevDebug('mindmap-ai', 'AiCreate.confirmAiOrganize parsed', {
                hasCurrent: !!(result && result.current),
                childrenCount:
                  result && result.children ? result.children.length : 0
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
      const node = this.getBeingOrganizeNode()
      if (!node) {
        throw new Error('target node missing')
      }
      const currentData = result.current.data
      const children = result.children || []
      if (children.length > 0) {
        Object.keys(currentData).forEach(key => {
          node.nodeData.data[key] = currentData[key]
        })
        this.mindMap.execCommand('INSERT_MULTI_CHILD_NODE', [node], children)
      } else {
        this.mindMap.renderer.setNodeDataRender(node, currentData)
      }
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

  .sidebarStatusList {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px dashed #dcdfe6;
  }

  .sidebarStatusItem {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 6px;
    color: #909399;
    font-size: 12px;

    strong {
      color: #303133;
      font-weight: 500;
      text-align: right;
    }
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

.aiCreatingMask {
  position: fixed;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  z-index: 99999;
  background-color: transparent;

  .btn {
    position: absolute;
    left: 50%;
    top: 100px;
    transform: translateX(-50%);
  }
}
</style>
