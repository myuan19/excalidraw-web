<template>
  <Sidebar ref="sidebar" :title="$t('ai.sidebarTitle') || 'AI 润色'">
    <div class="sidebarContent customScrollbar" :class="{ isDark: isDark }">
      <!-- 目标节点 -->
      <div class="title noTop">{{ $t('ai.targetNode') || '目标节点' }}</div>
      <div class="row">
        <div class="rowItem">
          <span class="nodeNameDisplay" v-html="targetNodeName"></span>
        </div>
      </div>

      <!-- 编辑范围 -->
      <div class="title">{{ $t('ai.editScope') || '编辑范围' }}</div>
      <div class="row">
        <div class="rowItem">
          <el-radio-group v-model="scope" size="mini">
            <el-radio-button label="current">{{ $t('ai.scopeCurrentOnly') || '仅当前节点' }}</el-radio-button>
            <el-radio-button label="subtree">{{ $t('ai.scopeSubtree') || '含所有子节点' }}</el-radio-button>
          </el-radio-group>
        </div>
      </div>

      <!-- 润色要求 -->
      <div class="title">{{ $t('ai.modifyRequirement') || '润色要求' }}</div>
      <div class="row">
        <div class="rowItem" style="width: 100%;">
          <el-input
            type="textarea"
            :rows="3"
            v-model="prompt"
            :placeholder="$t('ai.modifyRequirementPlaceholder') || '请输入润色要求…'"
            :disabled="isAiCreating"
            @keydown.native.enter.ctrl="onGenerate"
            @keydown.native.enter.meta="onGenerate"
            @keydown.native.stop
          ></el-input>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="row actionRow">
        <el-button
          v-if="!isAiCreating"
          type="primary"
          size="small"
          :disabled="!hasAiConfig"
          @click="onGenerate"
        >{{ $t('ai.confirm') || '开始润色' }}</el-button>
        <el-button
          v-else
          type="warning"
          size="small"
          @click="onStop"
        >{{ $t('ai.stopGenerating') || '停止生成' }}</el-button>
        <span class="configHint" v-if="!hasAiConfig">
          {{ $t('ai.mindMapAiConfigMissingTip') || 'AI 未配置' }}
        </span>
      </div>

      <!-- 生成预览 -->
      <template v-if="isAiCreating || streamContent">
        <div class="title">{{ $t('ai.streamingPreview') || '生成预览' }}</div>
        <div class="row">
          <pre class="streamContent">{{ streamContent || '等待 AI 输出…' }}</pre>
        </div>
      </template>
    </div>
  </Sidebar>
</template>

<script>
import Sidebar from './Sidebar.vue'
import { mapState } from 'vuex'

export default {
  components: { Sidebar },
  props: {
    mindMap: { type: Object }
  },
  data() {
    return {
      scope: 'subtree',
      prompt: '',
      isAiCreating: false,
      streamContent: '',
      activeNodes: [],
      targetNodeName: ''
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
    }
  },
  watch: {
    activeSidebar(val) {
      if (val === 'ai') {
        this.$refs.sidebar.show = true
        this.syncActiveNodes()
      } else {
        this.$refs.sidebar.show = false
      }
    }
  },
  mounted() {
    if (this.activeSidebar === 'ai' && this.$refs.sidebar) {
      this.$refs.sidebar.show = true
    }
  },
  created() {
    this.$bus.$on('node_active', this.onNodeActive)
    this.$bus.$on('ai_create_status', this.onAiStatus)
    this.$bus.$on('ai_stream_content', this.onAiStream)
    this.syncActiveNodes()
  },
  beforeDestroy() {
    this.$bus.$off('node_active', this.onNodeActive)
    this.$bus.$off('ai_create_status', this.onAiStatus)
    this.$bus.$off('ai_stream_content', this.onAiStream)
  },
  methods: {
    syncActiveNodes() {
      if (!this.mindMap) return
      const nodes = this.mindMap.renderer
        ? this.mindMap.renderer.activeNodeList || []
        : []
      this.activeNodes = [...nodes]
      this.updateTargetName()
    },

    updateTargetName() {
      const node = this.activeNodes.length > 0 ? this.activeNodes[0] : null
      if (node) {
        const text = node.nodeData && node.nodeData.data && node.nodeData.data.text
        this.targetNodeName = text
          ? String(text).replace(/<[^>]+>/g, '').slice(0, 40)
          : '(空)'
      } else {
        this.targetNodeName = this.$t('ai.rootNodeDefault') || '根节点 (全局)'
      }
    },

    onNodeActive(node, nodes) {
      this.activeNodes = [...(nodes || [])]
      this.updateTargetName()
    },

    onGenerate() {
      if (!this.prompt.trim()) return
      this.streamContent = ''
      this.$bus.$emit('ai_organize_node', {
        prompt: this.prompt,
        scope: this.scope,
        fromSidebar: true
      })
    },

    onStop() {
      this.$bus.$emit('ai_stop_create')
    },

    onAiStatus(status) {
      this.isAiCreating = status.creating
      if (!status.creating) {
        this.streamContent = ''
      }
    },

    onAiStream(content) {
      this.streamContent = content
    }
  }
}
</script>

<style lang="less" scoped>
.sidebarContent {
  padding: 20px;
  padding-top: 10px;

  &.isDark {
    .title { color: #fff; }
    .name { color: hsla(0, 0%, 100%, 0.6); }
    .nodeNameDisplay { color: hsla(0, 0%, 100%, 0.7); }
    .configHint { color: #e6a23c; }
    .streamContent { background: #1e2226; color: hsla(0, 0%, 100%, 0.7); }
  }

  .title {
    font-size: 14px;
    font-weight: 500;
    margin-top: 20px;
    margin-bottom: 10px;

    &.noTop { margin-top: 0; }
  }

  .row {
    margin-bottom: 10px;
  }

  .rowItem {
    display: flex;
    align-items: center;
  }

  .nodeNameDisplay {
    font-size: 13px;
    color: #333;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 240px;
    font-weight: 500;
  }

  .actionRow {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .configHint {
    font-size: 12px;
    color: #e6a23c;
  }

  .streamContent {
    font-size: 11px;
    font-family: monospace;
    background: #f5f5f5;
    border-radius: 4px;
    padding: 8px;
    max-height: 200px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-all;
    color: #666;
    width: 100%;
    margin: 0;
  }
}
</style>
