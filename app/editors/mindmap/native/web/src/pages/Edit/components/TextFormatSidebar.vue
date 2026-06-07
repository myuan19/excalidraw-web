<template>
  <Sidebar ref="sidebar" :title="$t('richTextToolbar.title') || '文本格式'">
    <div class="textFormatSidebarBox" :class="{ isDark: isDark }">
      <!-- 文本格式化区域 -->
      <div class="formatSection" v-if="hasTextSelection">
        <div class="sectionTitle">{{ $t('richTextToolbar.textFormat') || '文本格式' }}</div>
        <div class="formatBtnRow">
          <el-tooltip :content="$t('richTextToolbar.bold')" placement="top">
            <div class="fmtBtn" :class="{ active: formatInfo.bold }" @click="toggleBold">
              <span class="icon iconfont iconzitijiacu"></span>
            </div>
          </el-tooltip>
          <el-tooltip :content="$t('richTextToolbar.italic')" placement="top">
            <div class="fmtBtn" :class="{ active: formatInfo.italic }" @click="toggleItalic">
              <span class="icon iconfont iconzitixieti"></span>
            </div>
          </el-tooltip>
          <el-tooltip :content="$t('richTextToolbar.underline')" placement="top">
            <div class="fmtBtn" :class="{ active: formatInfo.underline }" @click="toggleUnderline">
              <span class="icon iconfont iconzitixiahuaxian"></span>
            </div>
          </el-tooltip>
          <el-tooltip :content="$t('richTextToolbar.strike')" placement="top">
            <div class="fmtBtn" :class="{ active: formatInfo.strike }" @click="toggleStrike">
              <span class="icon iconfont iconshanchuxian"></span>
            </div>
          </el-tooltip>
          <el-tooltip :content="$t('richTextToolbar.removeFormat')" placement="top">
            <div class="fmtBtn" @click="removeFormat">
              <span class="icon iconfont iconqingchu"></span>
            </div>
          </el-tooltip>
        </div>
        <div class="formatDetailRow">
          <div class="formatField">
            <span class="fieldLabel">{{ $t('style.fontFamily') || '字体' }}</span>
            <el-select size="mini" style="width: 110px" v-model="formatInfo.font" @change="changeFontFamily">
              <el-option v-for="item in fontFamilyList" :key="item.value" :label="item.name" :value="item.value" :style="{ fontFamily: item.value }"></el-option>
            </el-select>
          </div>
          <div class="formatField">
            <span class="fieldLabel">{{ $t('style.fontSize') || '字号' }}</span>
            <el-select size="mini" style="width: 70px" v-model="selectedFontSize" @change="changeFontSize">
              <el-option v-for="item in fontSizeList" :key="item" :label="item + 'px'" :value="item"></el-option>
            </el-select>
          </div>
        </div>
        <div class="formatDetailRow">
          <div class="formatField">
            <span class="fieldLabel">{{ $t('richTextToolbar.color') || '字色' }}</span>
            <el-color-picker size="mini" v-model="fontColor" @change="changeFontColor"></el-color-picker>
          </div>
          <div class="formatField">
            <span class="fieldLabel">{{ $t('richTextToolbar.backgroundColor') || '背景色' }}</span>
            <el-color-picker size="mini" v-model="fontBackgroundColor" @change="changeFontBackgroundColor"></el-color-picker>
          </div>
          <div class="formatField">
            <span class="fieldLabel">{{ $t('richTextToolbar.textAlign') || '对齐' }}</span>
            <el-select size="mini" style="width: 80px" v-model="formatInfo.align" @change="changeTextAlign">
              <el-option v-for="item in alignList" :key="item.value" :label="item.name" :value="item.value"></el-option>
            </el-select>
          </div>
        </div>
      </div>
      <div class="noTextSelectionHint" v-else>
        <span class="hintIcon iconfont iconbianji1"></span>
        <span>{{ $t('richTextToolbar.selectTextHint') || '双击节点并选中文字后可编辑格式' }}</span>
      </div>

      <!-- AI 润色区域 -->
      <div class="aiSection">
        <div class="sectionTitle aiSectionTitle">
          <span>AI {{ $t('ai.organizeCurrentNode') || '润色' }}</span>
        </div>
        <div class="aiTargetRow">
          <span class="aiTargetLabel">{{ $t('ai.targetNode') || '目标节点' }}</span>
          <span class="aiTargetName" v-html="aiTargetNodeName"></span>
        </div>
        <div class="aiScopeRow">
          <span>{{ $t('ai.editScope') || '编辑范围' }}</span>
          <el-radio-group v-model="aiScope" size="mini">
            <el-radio-button label="current">{{ $t('ai.scopeCurrentOnly') || '仅当前节点' }}</el-radio-button>
            <el-radio-button label="subtree">{{ $t('ai.scopeSubtree') || '含所有子节点' }}</el-radio-button>
          </el-radio-group>
        </div>
        <div class="aiPromptRow">
          <el-input
            type="textarea"
            :rows="3"
            v-model="aiPrompt"
            :placeholder="$t('ai.modifyRequirementPlaceholder') || '请输入润色要求…'"
            :disabled="isAiCreating"
            @keydown.native.enter.ctrl="onAiGenerate"
            @keydown.native.enter.meta="onAiGenerate"
          ></el-input>
        </div>
        <div class="aiActionRow">
          <el-button
            v-if="!isAiCreating"
            type="primary"
            size="small"
            :disabled="!hasAiConfig"
            @click="onAiGenerate"
          >{{ $t('ai.confirm') || '开始润色' }}</el-button>
          <el-button
            v-else
            type="warning"
            size="small"
            @click="onAiStop"
          >{{ $t('ai.stopGenerating') || '停止生成' }}</el-button>
          <span class="aiConfigHint" v-if="!hasAiConfig">
            {{ $t('ai.mindMapAiConfigMissingTip') || 'AI 未配置' }}
          </span>
        </div>
        <div class="aiStreamSection" v-if="isAiCreating || aiStreamContent">
          <div class="sectionTitle">{{ $t('ai.streamingPreview') || '生成预览' }}</div>
          <pre class="aiStreamContent">{{ aiStreamContent || '等待 AI 输出…' }}</pre>
        </div>
      </div>
    </div>
  </Sidebar>
</template>

<script>
import Sidebar from './Sidebar.vue'
import { fontFamilyList, fontSizeList, alignList } from '@/config'
import { mapState, mapMutations } from 'vuex'

export default {
  components: { Sidebar },
  props: {
    mindMap: { type: Object }
  },
  data() {
    return {
      fontSizeList,
      hasTextSelection: false,
      formatInfo: {},
      fontColor: '',
      fontBackgroundColor: '',
      selectedFontSize: 14,
      aiScope: 'subtree',
      aiPrompt: '',
      isAiCreating: false,
      aiStreamContent: '',
      activeNodes: [],
      aiTargetNodeName: ''
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark,
      activeSidebar: state => state.activeSidebar,
      aiConfig: state => state.aiConfig,
      enableAi: state => state.localConfig.enableAi
    }),
    fontFamilyList() {
      return fontFamilyList[this.$i18n.locale] || fontFamilyList.zh
    },
    alignList() {
      return alignList[this.$i18n.locale] || alignList.zh
    },
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
      if (val === 'textFormat') {
        this.$refs.sidebar.show = true
      } else {
        this.$refs.sidebar.show = false
      }
    }
  },
  mounted() {
    if (this.activeSidebar === 'textFormat' && this.$refs.sidebar) {
      this.$refs.sidebar.show = true
    }
  },
  created() {
    this.$bus.$on('rich_text_selection_change', this.onRichTextSelectionChange)
    this.$bus.$on('node_active', this.onNodeActive)
    this.$bus.$on('ai_create_status', this.onAiCreateStatus)
    this.$bus.$on('ai_stream_content', this.onAiStreamContent)
    this.syncActiveNodes()
  },
  beforeDestroy() {
    this.$bus.$off('rich_text_selection_change', this.onRichTextSelectionChange)
    this.$bus.$off('node_active', this.onNodeActive)
    this.$bus.$off('ai_create_status', this.onAiCreateStatus)
    this.$bus.$off('ai_stream_content', this.onAiStreamContent)
  },
  methods: {
    ...mapMutations(['setActiveSidebar', 'pushActiveSidebar', 'popActiveSidebar']),

    syncActiveNodes() {
      if (!this.mindMap) return
      const nodes = this.mindMap.renderer
        ? this.mindMap.renderer.activeNodeList || []
        : []
      this.activeNodes = [...nodes]
      this.updateAiTargetNodeName()
    },

    updateAiTargetNodeName() {
      const node = this.activeNodes.length > 0 ? this.activeNodes[0] : null
      if (node) {
        const text = node.nodeData && node.nodeData.data && node.nodeData.data.text
        this.aiTargetNodeName = text
          ? String(text).replace(/<[^>]+>/g, '').slice(0, 40)
          : '(空)'
      } else {
        this.aiTargetNodeName = this.$t('ai.rootNodeDefault') || '根节点 (全局)'
      }
    },

    onNodeActive(node, nodes) {
      this.activeNodes = [...(nodes || [])]
      this.updateAiTargetNodeName()
    },

    onRichTextSelectionChange(hasRange, rect, formatInfo) {
      this.hasTextSelection = hasRange
      if (hasRange) {
        this.formatInfo = { ...(formatInfo || {}) }
        this.fontColor = formatInfo.color || ''
        this.fontBackgroundColor = formatInfo.background || ''
        const sizeStr = String(formatInfo.size || '').replace('px', '')
        this.selectedFontSize = parseInt(sizeStr, 10) || 14
      }
    },

    // Text formatting methods
    toggleBold() {
      this.formatInfo.bold = !this.formatInfo.bold
      this.mindMap.richText.formatText({ bold: this.formatInfo.bold })
    },
    toggleItalic() {
      this.formatInfo.italic = !this.formatInfo.italic
      this.mindMap.richText.formatText({ italic: this.formatInfo.italic })
    },
    toggleUnderline() {
      this.formatInfo.underline = !this.formatInfo.underline
      this.mindMap.richText.formatText({ underline: this.formatInfo.underline })
    },
    toggleStrike() {
      this.formatInfo.strike = !this.formatInfo.strike
      this.mindMap.richText.formatText({ strike: this.formatInfo.strike })
    },
    changeFontFamily(font) {
      this.mindMap.richText.formatText({ font })
    },
    changeFontSize(size) {
      this.formatInfo.size = size + 'px'
      this.mindMap.richText.formatText({ size: size + 'px' })
    },
    changeFontColor(color) {
      this.formatInfo.color = color
      this.mindMap.richText.formatText({ color })
    },
    changeFontBackgroundColor(background) {
      this.formatInfo.background = background
      this.mindMap.richText.formatText({ background })
    },
    changeTextAlign(align) {
      this.mindMap.richText.formatText({ align })
    },
    removeFormat() {
      this.mindMap.richText.removeFormat()
    },

    // AI methods
    onAiGenerate() {
      if (!this.aiPrompt.trim() && !this.activeNodes.length) return
      this.aiStreamContent = ''
      this.$bus.$emit('ai_organize_node', {
        prompt: this.aiPrompt,
        scope: this.aiScope,
        fromSidebar: true
      })
    },
    onAiStop() {
      this.$bus.$emit('ai_stop_create')
    },
    onAiCreateStatus(status) {
      this.isAiCreating = status.creating
      if (!status.creating) {
        this.aiStreamContent = ''
      }
    },
    onAiStreamContent(content) {
      this.aiStreamContent = content
    }
  }
}
</script>

<style lang="less" scoped>
.textFormatSidebarBox {
  padding: 12px 16px;

  &.isDark {
    color: hsla(0, 0%, 100%, 0.8);

    .sectionTitle {
      color: hsla(0, 0%, 100%, 0.9);
    }
    .fmtBtn {
      color: hsla(0, 0%, 100%, 0.7);
      &:hover { background: hsla(0, 0%, 100%, 0.08); }
      &.active { color: #67c23a; background: hsla(0, 0%, 100%, 0.05); }
    }
    .fieldLabel { color: hsla(0, 0%, 100%, 0.5); }
    .noTextSelectionHint { color: hsla(0, 0%, 100%, 0.4); }
    .aiTargetName { color: hsla(0, 0%, 100%, 0.7); }
    .aiStreamContent { background: #1e2226; color: hsla(0, 0%, 100%, 0.7); }
  }

  .sectionTitle {
    font-size: 13px;
    font-weight: 600;
    color: #333;
    margin-bottom: 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid #eee;
  }

  .noTextSelectionHint {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px 0;
    color: #999;
    font-size: 13px;
    .hintIcon { font-size: 16px; }
  }

  .formatSection {
    margin-bottom: 16px;
  }

  .formatBtnRow {
    display: flex;
    gap: 2px;
    margin-bottom: 10px;
  }

  .fmtBtn {
    width: 34px;
    height: 34px;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.15s;
    &:hover { background: #f0f0f0; }
    &.active { color: #12bb37; background: #eefbed; }
    .icon { font-size: 16px; }
  }

  .formatDetailRow {
    display: flex;
    gap: 10px;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }

  .formatField {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .fieldLabel {
    font-size: 12px;
    color: #999;
    white-space: nowrap;
  }

  .aiSection {
    border-top: 1px solid #eee;
    padding-top: 12px;
  }

  .aiSectionTitle {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .aiTargetRow {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    margin-bottom: 8px;
  }

  .aiTargetLabel {
    color: #999;
    white-space: nowrap;
  }

  .aiTargetName {
    color: #333;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 180px;
    font-weight: 500;
  }

  .aiScopeRow {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    margin-bottom: 10px;
    color: #666;
  }

  .aiPromptRow {
    margin-bottom: 10px;
  }

  .aiActionRow {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }

  .aiConfigHint {
    font-size: 12px;
    color: #e6a23c;
  }

  .aiStreamSection {
    margin-top: 8px;
  }

  .aiStreamContent {
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
  }
}
</style>
