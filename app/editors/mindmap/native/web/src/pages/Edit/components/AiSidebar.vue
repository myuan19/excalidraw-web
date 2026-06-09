<template>
  <Sidebar ref="sidebar" :title="$t('ai.sidebarTitle') || 'AI 润色'" panelKey="ai">
    <div class="aiSidebarBox" :class="{ isDark: isDark }">
      <NodePreviewStage :mindMap="mindMap" :isDark="isDark">
        <div class="nodePreviewNode" :style="targetNodePreviewStyle">
          {{ targetNodePreviewText }}
        </div>
      </NodePreviewStage>
      <div class="aiPanelContent customScrollbar">
      <section class="sectionBlock">
        <div class="sectionLabel">{{ $t('ai.editScope') || '编辑范围' }}</div>
        <el-radio-group
          class="scopeGroup"
          v-model="scope"
          size="mini"
          :disabled="isAiCreating"
        >
          <el-radio-button label="current">{{
            $t('ai.scopeCurrentOnly') || '仅当前节点'
          }}</el-radio-button>
          <el-radio-button label="subtree">{{
            $t('ai.scopeSubtree') || '含所有子节点'
          }}</el-radio-button>
        </el-radio-group>
        <div class="contextLimitRow" v-show="scope === 'subtree'">
          <span class="contextLimitLabel">{{
            $t('ai.contextCharLimit') || '上下文上限'
          }}</span>
          <el-input-number
            v-model="contextCharLimit"
            size="mini"
            :min="contextCharLimitMin"
            :max="contextCharLimitMax"
            :step="contextCharLimitStep"
            :disabled="isAiCreating"
            controls-position="right"
          ></el-input-number>
          <span class="contextLimitUnit">{{
            $t('ai.contextCharLimitUnit') || '字'
          }}</span>
        </div>
        <div class="permissionSwitchRow" v-show="scope === 'subtree'">
          <div class="permissionSwitchText">
            <div class="permissionSwitchTitle">{{
              $t('ai.allowCreateChildren') || '允许新增子节点'
            }}</div>
            <div class="permissionSwitchTip">{{
              $t('ai.allowCreateChildrenTip') ||
                '开启后 AI 才能新增子节点；默认关闭。'
            }}</div>
          </div>
          <el-switch
            v-model="allowCreateChildren"
            :disabled="isAiCreating"
          ></el-switch>
        </div>
        <div class="permissionSwitchRow" v-show="scope === 'subtree'">
          <div class="permissionSwitchText">
            <div class="permissionSwitchTitle">{{
              $t('ai.allowDeleteNodes') || '允许删除节点'
            }}</div>
            <div class="permissionSwitchTip">{{
              $t('ai.allowDeleteNodesTip') ||
                '开启后 AI 才能删除子节点；默认关闭，防止误删。'
            }}</div>
          </div>
          <el-switch
            v-model="allowDeleteNodes"
            :disabled="isAiCreating"
          ></el-switch>
        </div>
      </section>

      <section class="sectionBlock">
        <div class="sectionLabel">{{ $t('ai.modifyRequirement') || '修改要求' }}</div>
        <el-input
          class="requirementInput"
          type="textarea"
          :rows="5"
          v-model="prompt"
          :placeholder="
            $t('ai.modifyRequirementPlaceholder') || '请输入修改要求…'
          "
          :disabled="isAiCreating"
          @keydown.native.enter.ctrl="onGenerate"
          @keydown.native.enter.meta="onGenerate"
          @keydown.native.stop
        ></el-input>
        <div class="actionRow">
          <el-button
            v-if="!isAiCreating"
            type="primary"
            size="small"
            :disabled="!hasAiConfig || !prompt.trim()"
            @click="onGenerate"
          >{{ $t('ai.startPolish') || '开始修改' }}</el-button>
          <el-button v-else type="warning" size="small" @click="onStop">{{
            $t('ai.stopGenerating') || '停止生成'
          }}</el-button>
        </div>
        <div class="configHint" v-if="!hasAiConfig">
          {{ $t('ai.mindMapAiConfigMissingTip') || 'AI 未配置' }}
        </div>
      </section>

      <section class="sectionBlock streamSection" v-if="isAiCreating || streamContent">
        <div class="sectionLabel">{{ $t('ai.streamingPreview') || '生成过程' }}</div>
        <pre class="streamContent">{{
          streamContent || $t('ai.waitingForAiOutput') || '等待 AI 输出…'
        }}</pre>
      </section>

      <section class="sectionBlock presetSection">
        <div class="presetSectionHeader">
          <div class="presetHeaderMain">
            <div class="sectionLabel noMargin">{{ $t('ai.savedPromptPresets') || '模板' }}</div>
            <div class="presetHint">
              {{ $t('ai.promptPresetInsertTip') || '点击插入到上方表单，不会保持选中' }}
            </div>
          </div>
          <el-button
            size="mini"
            type="text"
            :disabled="!prompt.trim()"
            @click="savePromptPreset"
          >
            {{ $t('ai.saveAsPromptPreset') || '保存模板' }}
          </el-button>
        </div>
        <div class="presetList" v-if="promptPresets.length > 0">
          <div
            class="presetInsertBtn"
            v-for="preset in promptPresets"
            :key="preset.id"
            :class="{ disabled: isAiCreating }"
            @click="applyPromptPreset(preset)"
          >
            <div class="presetInsertMain">
              <div class="presetInsertTitle">{{ getPresetTitle(preset) }}</div>
              <div class="presetInsertMeta">{{ getPresetScopeText(preset) }}</div>
            </div>
            <i
              class="el-icon-delete presetDelete"
              :class="{ disabled: isAiCreating }"
              @click.stop="deletePromptPreset(preset)"
            ></i>
          </div>
        </div>
        <div class="emptyPreset" v-else>
          {{ $t('ai.noPromptPresets') || '暂无模板' }}
        </div>
      </section>
      </div>
    </div>
  </Sidebar>
</template>

<script>
import Sidebar from './Sidebar.vue'
import NodePreviewStage from '@/components/sidebar/NodePreviewStage.vue'
import { mapState } from 'vuex'
import {
  deleteMindMapOrganizePromptPreset,
  listMindMapOrganizePromptPresets,
  saveMindMapOrganizePromptPreset
} from '@/utils/aiPromptPresets'
import {
  AI_CONTEXT_CHAR_LIMIT,
  normalizeContextCharLimit
} from '@/utils/aiContext'
import { mindmapDevDebug } from '@/utils/mindmapDevDebug'
import { sidebarMemoryDebug } from '@/utils/sidebarDebug'
import sidebarPanelDebug from '@/mixins/sidebarPanelDebug'
import sidebarHistorySync from '@/mixins/sidebarHistorySync'
import { buildNodeDomPreviewStyle } from '@/utils/nodePreviewStyle'

export default {
  name: 'AiSidebar',
  mixins: [sidebarPanelDebug, sidebarHistorySync],
  components: { Sidebar, NodePreviewStage },
  props: {
    mindMap: { type: Object }
  },
  data() {
    return {
      scope: 'current',
      prompt: '',
      isAiCreating: false,
      streamContent: '',
      activeNodes: [],
      targetNodeName: '',
      frozenTargetUid: '',
      frozenTargetName: '',
      promptPresets: [],
      allowCreateChildren: false,
      allowDeleteNodes: false,
      contextCharLimit: AI_CONTEXT_CHAR_LIMIT.DEFAULT,
      contextCharLimitMin: AI_CONTEXT_CHAR_LIMIT.MIN,
      contextCharLimitMax: AI_CONTEXT_CHAR_LIMIT.MAX,
      contextCharLimitStep: AI_CONTEXT_CHAR_LIMIT.STEP
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark,
      activeSidebar: state => state.activeSidebar,
      aiConfig: state => state.aiConfig
    }),
    hasAiConfig() {
      return !!(
        this.aiConfig &&
        String(this.aiConfig.api || '').trim() &&
        String(this.aiConfig.key || '').trim() &&
        String(this.aiConfig.model || '').trim()
      )
    },
    targetNodePreviewText() {
      return this.stripHtml(this.targetNodeName).slice(0, 18) || '(空)'
    },
    targetNodePreviewStyle() {
      const node = this.getPreviewNode()
      return buildNodeDomPreviewStyle(node, { isDark: this.isDark })
    }
  },
  watch: {
    activeSidebar(val, oldVal) {
      this.logSidebarPanelWatch('ai', val, oldVal)
      if (!this.$refs.sidebar) {
        this.logSidebarPanelWatch('ai', val, oldVal, { branch: 'missing-ref' })
        return
      }
      if (val === 'ai') {
        this.$refs.sidebar.show = true
        this.syncActiveNodes()
        this.logSidebarPanelWatch('ai', val, oldVal, { branch: 'show-true' })
      } else if (this.$refs.sidebar.show) {
        this.$refs.sidebar.show = false
        this.logSidebarPanelWatch('ai', val, oldVal, { branch: 'show-false' })
      }
    },
    scope(val, oldVal) {
      if (val === oldVal) return
      if (val !== 'subtree') {
        this.allowCreateChildren = false
        this.allowDeleteNodes = false
      }
    }
  },
  mounted() {
    this.logSidebarPanelMounted('ai')
    sidebarMemoryDebug('ai sidebar mounted', {
      activeSidebar: this.activeSidebar || null
    })
    this.syncActiveNodes()
    this.scheduleDeferredInit()
  },
  created() {
    this.logSidebarPanelCreated('ai')
    this.$bus.$on('node_active', this.onNodeActive)
    this.$bus.$on('ai_create_status', this.onAiStatus)
    this.$bus.$on('ai_stream_content', this.onAiStream)
  },
  beforeDestroy() {
    sidebarMemoryDebug('ai sidebar destroy', {})
    this.$bus.$off('node_active', this.onNodeActive)
    this.$bus.$off('ai_create_status', this.onAiStatus)
    this.$bus.$off('ai_stream_content', this.onAiStream)
  },
  methods: {
    scheduleDeferredInit() {
      const run = () => {
        sidebarMemoryDebug('ai sidebar deferred init start', {})
        const startedAt = performance.now()
        this.loadPromptPresets().finally(() => {
          sidebarMemoryDebug('ai sidebar deferred init done', {
            ms: Math.round(performance.now() - startedAt)
          })
        })
      }
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(run, { timeout: 1500 })
      } else {
        window.setTimeout(run, 0)
      }
    },

    syncFromEditHistory() {
      if (!this.mindMap || this.isAiCreating) return
      this.syncActiveNodes()
    },

    syncActiveNodes() {
      if (!this.mindMap) return
      if (this.isAiCreating) {
        mindmapDevDebug('mindmap-ai-freeze', 'AiSidebar.syncActiveNodes ignored while creating', {
          frozenTargetUid: this.frozenTargetUid,
          frozenTargetName: this.frozenTargetName,
          currentTargetName: this.targetNodeName
        })
        return
      }
      const nodes = this.mindMap.renderer
        ? this.mindMap.renderer.activeNodeList || []
        : []
      this.activeNodes = [...nodes]
      this.updateTargetName()
      mindmapDevDebug('mindmap-ai-freeze', 'AiSidebar.syncActiveNodes applied', {
        activeCount: this.activeNodes.length,
        targetNodeName: this.targetNodeName,
        activeUids: this.activeNodes.map(item => item.getData && item.getData('uid'))
      })
    },

    updateTargetName() {
      const node = this.getPreviewNode()
      if (node) {
        const text = node.nodeData && node.nodeData.data && node.nodeData.data.text
        this.targetNodeName = text
          ? String(text).replace(/<[^>]+>/g, '').slice(0, 40)
          : '(空)'
      } else {
        this.targetNodeName = this.$t('ai.rootNodeDefault') || '根节点 (全局)'
      }
    },

    getPreviewNode() {
      if (this.activeNodes.length > 0) {
        return this.activeNodes[0]
      }
      return this.mindMap &&
        this.mindMap.renderer &&
        this.mindMap.renderer.root
        ? this.mindMap.renderer.root
        : null
    },

    stripHtml(value) {
      return String(value || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p\s*>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim()
    },

    syncTargetNodeByUid(uid) {
      if (!uid || !this.mindMap || !this.mindMap.renderer) {
        return false
      }
      const node = this.mindMap.renderer.findNodeByUid
        ? this.mindMap.renderer.findNodeByUid(uid)
        : null
      if (!node) {
        return false
      }
      this.activeNodes = [node]
      this.updateTargetName()
      mindmapDevDebug('mindmap-ai-freeze', 'AiSidebar.sync target by uid', {
        uid,
        targetNodeName: this.targetNodeName
      })
      return true
    },

    onNodeActive(node, nodes) {
      if (this.isAiCreating) {
        mindmapDevDebug('mindmap-ai-freeze', 'AiSidebar.onNodeActive ignored while creating', {
          incomingNodeUid: node && node.getData ? node.getData('uid') : '',
          incomingCount: (nodes || []).length,
          incomingUids: (nodes || []).map(item =>
            item && item.getData ? item.getData('uid') : ''
          ),
          frozenTargetUid: this.frozenTargetUid,
          frozenTargetName: this.frozenTargetName,
          currentTargetName: this.targetNodeName
        })
        return
      }
      this.activeNodes = [...(nodes || [])]
      this.updateTargetName()
      mindmapDevDebug('mindmap-ai-freeze', 'AiSidebar.onNodeActive applied', {
        incomingNodeUid: node && node.getData ? node.getData('uid') : '',
        activeCount: this.activeNodes.length,
        targetNodeName: this.targetNodeName
      })
    },

    onGenerate() {
      if (!this.prompt.trim()) return
      this.contextCharLimit = normalizeContextCharLimit(this.contextCharLimit)
      mindmapDevDebug('mindmap-ai-sidebar', 'generate from sidebar', {
        scope: this.scope,
        allowCreateChildren: this.allowCreateChildren,
        allowDeleteNodes: this.allowDeleteNodes,
        contextCharLimit: this.contextCharLimit,
        promptLen: this.prompt.trim().length,
        promptPreview: this.prompt.trim().slice(0, 80),
        targetNodeName: this.targetNodeName,
        activeCount: this.activeNodes.length,
        hasAiConfig: this.hasAiConfig
      })
      this.streamContent = ''
      this.$bus.$emit('ai_organize_node', {
        prompt: this.prompt,
        scope: this.scope,
        allowCreateChildren:
          this.scope === 'subtree' && this.allowCreateChildren,
        allowDeleteNodes: this.scope === 'subtree' && this.allowDeleteNodes,
        contextCharLimit: this.contextCharLimit,
        fromSidebar: true
      })
    },

    onStop() {
      this.$bus.$emit('ai_stop_create')
    },

    onAiStatus(status) {
      const wasCreating = this.isAiCreating
      this.isAiCreating = status.creating
      if (status.creating && !wasCreating) {
        this.frozenTargetUid = status.targetUid || ''
        this.frozenTargetName = status.targetName || this.targetNodeName
        if (this.frozenTargetName) {
          this.targetNodeName = this.frozenTargetName
        }
        mindmapDevDebug('mindmap-ai-freeze', 'AiSidebar.freeze target on creating', {
          frozenTargetUid: this.frozenTargetUid,
          frozenTargetName: this.frozenTargetName,
          statusScope: status.scope,
          targetNodeName: this.targetNodeName
        })
        return
      }
      if (!status.creating && wasCreating) {
        const frozenTargetUid = this.frozenTargetUid
        mindmapDevDebug('mindmap-ai-freeze', 'AiSidebar.unfreeze target on stopped', {
          frozenTargetUid,
          frozenTargetName: this.frozenTargetName,
          targetNodeName: this.targetNodeName,
          statusTargetName: status.targetName
        })
        this.frozenTargetUid = ''
        this.frozenTargetName = ''
        this.$nextTick(() => {
          if (!this.syncTargetNodeByUid(frozenTargetUid)) {
            this.syncActiveNodes()
          }
        })
        return
      }
      mindmapDevDebug('mindmap-ai-freeze', 'AiSidebar.onAiStatus no state change', {
        creating: status.creating,
        wasCreating,
        targetNodeName: this.targetNodeName
      })
    },

    onAiStream(content) {
      this.streamContent = content
    },

    async loadPromptPresets() {
      try {
        this.promptPresets = await listMindMapOrganizePromptPresets()
      } catch (error) {
        console.log(error)
      }
    },

    applyPromptPreset(preset) {
      if (this.isAiCreating || !preset) return
      this.prompt = preset.prompt || ''
      if (
        preset.options &&
        (preset.options.scope === 'current' || preset.options.scope === 'subtree')
      ) {
        this.scope = preset.options.scope
      }
      if (preset.options && preset.options.contextCharLimit) {
        this.contextCharLimit = normalizeContextCharLimit(
          preset.options.contextCharLimit
        )
      }
      this.allowCreateChildren = !!(
        preset.options && preset.options.allowCreateChildren
      )
      this.allowDeleteNodes = !!(preset.options && preset.options.allowDeleteNodes)
      mindmapDevDebug('mindmap-ai-sidebar', 'apply prompt preset', {
        id: preset.id,
        scope: this.scope,
        allowCreateChildren: this.allowCreateChildren,
        allowDeleteNodes: this.allowDeleteNodes,
        contextCharLimit: this.contextCharLimit,
        promptLen: this.prompt.length,
        promptPreview: this.prompt.slice(0, 80),
        isAiCreating: this.isAiCreating
      })
    },

    async savePromptPreset() {
      const prompt = this.prompt.trim()
      if (!prompt) {
        this.$message.warning(
          this.$t('ai.modifyRequirementRequired') || '请输入修改要求'
        )
        return
      }
      const name =
        prompt.slice(0, 20) ||
        this.$t('ai.unnamedPromptPreset') ||
        '未命名模板'
      mindmapDevDebug('mindmap-ai-sidebar', 'save prompt preset start', {
        scope: this.scope,
        promptLen: prompt.length,
        promptPreview: prompt.slice(0, 80),
        contextCharLimit: this.contextCharLimit,
        allowCreateChildren: this.allowCreateChildren,
        allowDeleteNodes: this.allowDeleteNodes,
        isAiCreating: this.isAiCreating
      })
      try {
        const saved = await saveMindMapOrganizePromptPreset({
          name,
          prompt,
          options: {
            scope: this.scope,
            allowCreateChildren:
              this.scope === 'subtree' && !!this.allowCreateChildren,
            allowDeleteNodes:
              this.scope === 'subtree' && !!this.allowDeleteNodes,
            contextCharLimit: normalizeContextCharLimit(this.contextCharLimit)
          },
          sort_index: this.promptPresets.length
        })
        this.promptPresets.push(saved)
        mindmapDevDebug('mindmap-ai-sidebar', 'save prompt preset success', {
          id: saved.id,
          scope: saved.options && saved.options.scope,
          allowCreateChildren: saved.options && saved.options.allowCreateChildren,
          allowDeleteNodes: saved.options && saved.options.allowDeleteNodes,
          contextCharLimit: saved.options && saved.options.contextCharLimit,
          promptLen: saved.prompt ? saved.prompt.length : 0,
          isAiCreating: this.isAiCreating
        })
        this.$message.success(this.$t('ai.promptPresetSaved') || '模板已保存')
      } catch (error) {
        console.log(error)
        mindmapDevDebug('mindmap-ai-sidebar', 'save prompt preset failed', {
          message: error && error.message ? error.message : String(error),
          isAiCreating: this.isAiCreating
        })
        this.$message.error(
          this.$t('ai.promptPresetSaveFailed') || '模板保存失败'
        )
      }
    },

    async deletePromptPreset(preset) {
      if (this.isAiCreating) return
      try {
        await deleteMindMapOrganizePromptPreset(preset.id)
        this.promptPresets = this.promptPresets.filter(item => item.id !== preset.id)
        this.$message.success(
          this.$t('ai.promptPresetDeleted') || '模板已删除'
        )
      } catch (error) {
        console.log(error)
        this.$message.error(
          this.$t('ai.promptPresetDeleteFailed') || '模板删除失败'
        )
      }
    },

    getPresetTitle(preset) {
      const name = String((preset && preset.name) || '').trim()
      if (name) {
        return name
      }
      const prompt = String((preset && preset.prompt) || '').trim()
      if (!prompt) {
        return this.$t('ai.unnamedPromptPreset') || '未命名模板'
      }
      return prompt.length > 24 ? `${prompt.slice(0, 24)}...` : prompt
    },

    getPresetScopeText(preset) {
      const scope = preset && preset.options ? preset.options.scope : ''
      if (scope === 'current') {
        return this.$t('ai.scopeCurrentOnly') || '仅当前节点'
      }
      const limit = normalizeContextCharLimit(
        preset && preset.options
          ? preset.options.contextCharLimit
          : AI_CONTEXT_CHAR_LIMIT.DEFAULT
      )
      const createText =
        preset && preset.options && preset.options.allowCreateChildren
          ? ` · ${this.$t('ai.childrenEnabled') || '可新增子节点'}`
          : ''
      const deleteText =
        preset && preset.options && preset.options.allowDeleteNodes
          ? ` · ${this.$t('ai.deleteNodesAllowed') || '可删除节点'}`
          : ''
      return `${this.$t('ai.scopeSubtree') || '含所有子节点'} · ${limit}${
        this.$t('ai.contextCharLimitUnit') || '字'
      }${createText}${deleteText}`
    }
  }
}
</script>

<style lang="less" scoped>
@import '@/styles/nodePreview.less';

.aiSidebarBox {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.aiPanelContent {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px;
  padding-top: 12px;
}

.aiSidebarBox.isDark {
  .aiPanelContent {
    .sectionLabel,
    .presetHint,
    .contextLimitLabel,
    .contextLimitUnit,
    .permissionSwitchTitle,
    .permissionSwitchTip {
      color: hsla(0, 0%, 100%, 0.55);
    }

    .presetInsertBtn,
    .streamContent {
      color: hsla(0, 0%, 100%, 0.78);
      background: #1e2226;
      border-color: rgba(255, 255, 255, 0.08);
    }

    .permissionSwitchRow {
      background: #1e2226;
      border-color: rgba(255, 255, 255, 0.08);
    }

    .presetInsertTitle {
      color: hsla(0, 0%, 100%, 0.9);
    }

    .presetInsertMeta {
      color: hsla(0, 0%, 100%, 0.45);
    }

    .requirementInput /deep/ .el-textarea__inner {
      color: hsla(0, 0%, 100%, 0.78);
      background: #1e2226;
      border-color: rgba(255, 255, 255, 0.08);
    }

    .presetSection {
      border-top-color: rgba(255, 255, 255, 0.08);
    }
  }
}

.aiPanelContent {
  .sectionBlock + .sectionBlock {
    margin-top: 16px;
  }

  .sectionLabel {
    margin-bottom: 8px;
    color: #606266;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.4;

    &.noMargin {
      margin-bottom: 0;
    }
  }

  .scopeGroup {
    display: flex;
    width: 100%;

    /deep/ .el-radio-button {
      flex: 1;
    }

    /deep/ .el-radio-button__inner {
      width: 100%;
      padding: 8px 10px;
      border-radius: 0;
    }

    /deep/ .el-radio-button:first-child .el-radio-button__inner {
      border-radius: 8px 0 0 8px;
    }

    /deep/ .el-radio-button:last-child .el-radio-button__inner {
      border-radius: 0 8px 8px 0;
    }
  }

  .contextLimitRow {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
    padding: 8px 10px;
    background: #fafbfc;
    border: 1px solid #ebeef5;
    border-radius: 8px;

    /deep/ .el-input-number {
      width: 108px;
    }
  }

  .contextLimitLabel,
  .contextLimitUnit {
    color: #909399;
    font-size: 12px;
    white-space: nowrap;
  }

  .permissionSwitchRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 8px;
    padding: 9px 10px;
    background: #fafbfc;
    border: 1px solid #ebeef5;
    border-radius: 8px;
  }

  .permissionSwitchText {
    flex: 1;
    min-width: 0;
  }

  .permissionSwitchTitle {
    color: #606266;
    font-size: 12px;
    line-height: 1.4;
  }

  .permissionSwitchTip {
    margin-top: 2px;
    color: #909399;
    font-size: 11px;
    line-height: 1.4;
  }

  .requirementInput {
    width: 100%;

    /deep/ .el-textarea__inner {
      min-height: 112px !important;
      padding: 10px 12px;
      line-height: 1.6;
      border-radius: 8px;
      resize: vertical;
    }
  }

  .actionRow {
    margin-top: 10px;

    /deep/ .el-button {
      width: 100%;
      border-radius: 8px;
    }
  }

  .configHint {
    margin-top: 8px;
    color: #e6a23c;
    font-size: 12px;
    line-height: 1.5;
  }

  .streamSection {
    .streamContent {
      margin: 0;
      padding: 10px 12px;
      max-height: 180px;
      overflow-y: auto;
      color: #606266;
      font-size: 11px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
        monospace;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-all;
      background: #f8fafc;
      border: 1px solid #ebeef5;
      border-radius: 8px;
    }
  }

  .presetSection {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid #f0f2f5;
  }

  .presetSectionHeader {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
  }

  .presetHeaderMain {
    flex: 1;
    min-width: 0;
  }

  .presetHint {
    margin-top: 4px;
    color: #909399;
    font-size: 11px;
    line-height: 1.4;
  }

  .presetList {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 220px;
    overflow-y: auto;
  }

  .presetInsertBtn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 12px;
    background: #fff;
    border: 1px solid #e4e7ed;
    border-radius: 8px;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;

    &:hover:not(.disabled) {
      border-color: #c6e2ff;
      background: #f5faff;
    }

    &.disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
  }

  .presetInsertMain {
    flex: 1;
    min-width: 0;
  }

  .presetInsertTitle {
    color: #303133;
    font-size: 13px;
    line-height: 1.4;
    word-break: break-word;
  }

  .presetInsertMeta {
    margin-top: 4px;
    color: #909399;
    font-size: 11px;
    line-height: 1.4;
  }

  .presetDelete {
    flex-shrink: 0;
    color: #c0c4cc;
    font-size: 14px;
    cursor: pointer;

    &:hover:not(.disabled) {
      color: #f56c6c;
    }

    &.disabled {
      color: #dcdfe6;
      cursor: not-allowed;
    }
  }

  .emptyPreset {
    padding: 14px 10px;
    color: #909399;
    font-size: 12px;
    text-align: center;
    background: #fafbfc;
    border: 1px dashed #e4e7ed;
    border-radius: 8px;
  }
}
</style>
