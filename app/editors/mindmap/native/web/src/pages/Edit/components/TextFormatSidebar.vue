<template>
  <Sidebar ref="sidebar" :title="$t('richTextToolbar.title') || '文本格式'" panelKey="textFormat">
    <div class="sidebarContent customScrollbar" :class="{ isDark: isDark }">
      <div class="toolbarSwitchRow">
        <el-checkbox v-model="showFloatingToolbarOnSelection">
          {{ $t('richTextToolbar.showFloatingToolbar') || '划选文字时显示浮动工具栏' }}
        </el-checkbox>
      </div>

      <template v-if="hasTextTarget">
        <div
          class="formatRow"
          :class="{ active: formatInfo.bold }"
          @mousedown.prevent.stop
          @click.stop="toggleBold"
        >
          <span class="icon iconfont iconzitijiacu"></span>
          <span class="label">{{ $t('richTextToolbar.bold') || '加粗' }}</span>
        </div>

        <div
          class="formatRow"
          :class="{ active: formatInfo.italic }"
          @mousedown.prevent.stop
          @click.stop="toggleItalic"
        >
          <span class="icon iconfont iconzitixieti"></span>
          <span class="label">{{ $t('richTextToolbar.italic') || '斜体' }}</span>
        </div>

        <div
          class="formatRow"
          :class="{ active: formatInfo.underline }"
          @mousedown.prevent.stop
          @click.stop="toggleUnderline"
        >
          <span class="icon iconfont iconzitixiahuaxian"></span>
          <span class="label">{{ $t('richTextToolbar.underline') || '下划线' }}</span>
        </div>

        <div
          class="formatRow"
          :class="{ active: formatInfo.strike }"
          @mousedown.prevent.stop
          @click.stop="toggleStrike"
        >
          <span class="icon iconfont iconshanchuxian"></span>
          <span class="label">{{ $t('richTextToolbar.strike') || '删除线' }}</span>
        </div>

        <div class="divider"></div>

        <DelayedPopover placement="left">
          <div class="fontOptionsList" :class="{ isDark: isDark }">
            <div
              class="fontOptionItem"
              v-for="item in fontFamilyList"
              :key="item.value"
              :style="{ fontFamily: item.value }"
              :class="{ active: formatInfo.font === item.value }"
              @mousedown.prevent.stop
              @click.stop="changeFontFamily(item.value)"
            >
              {{ item.name }}
            </div>
          </div>
          <div class="formatRow" slot="reference" @mousedown.prevent.stop>
            <span class="icon iconfont iconxingzhuang-wenzi"></span>
            <span class="label">{{ $t('richTextToolbar.fontFamily') || '字体' }}</span>
            <span class="valueText" :style="{ fontFamily: formatInfo.font }">
              {{ getFontFamilyLabel(formatInfo.font) }}
            </span>
          </div>
        </DelayedPopover>

        <DelayedPopover placement="left">
          <div class="fontOptionsList" :class="{ isDark: isDark }">
            <div
              class="fontOptionItem"
              v-for="item in fontSizeList"
              :key="item"
              :style="{
                fontSize: item + 'px',
                height: (item < 30 ? 30 : item + 10) + 'px'
              }"
              :class="{ active: formatInfo.size === item + 'px' }"
              @mousedown.prevent.stop
              @click.stop="changeFontSize(item)"
            >
              {{ item }}px
            </div>
          </div>
          <div class="formatRow" slot="reference" @mousedown.prevent.stop>
            <span class="icon iconfont iconcase fontColor"></span>
            <span class="label">{{ $t('richTextToolbar.fontSize') || '字号' }}</span>
            <span class="valueText">{{ formatInfo.size || '' }}</span>
          </div>
        </DelayedPopover>

        <div class="divider"></div>

        <DelayedPopover placement="left">
          <Color :color="fontColor" @change="changeFontColor"></Color>
          <div class="formatRow" slot="reference" @mousedown.prevent.stop>
            <span class="icon iconfont iconzitiyanse" :style="{ color: formatInfo.color }"></span>
            <span class="label">{{ $t('richTextToolbar.color') || '字色' }}</span>
            <span class="colorPreview" :style="{ backgroundColor: formatInfo.color || 'transparent' }"></span>
          </div>
        </DelayedPopover>

        <DelayedPopover placement="left">
          <Color
            :color="fontBackgroundColor"
            @change="changeFontBackgroundColor"
          ></Color>
          <div class="formatRow" slot="reference" @mousedown.prevent.stop>
            <span class="icon iconfont iconbeijingyanse"></span>
            <span class="label">{{ $t('richTextToolbar.backgroundColor') || '背景色' }}</span>
            <span class="colorPreview" :style="{ backgroundColor: formatInfo.background || 'transparent' }"></span>
          </div>
        </DelayedPopover>

        <div class="divider"></div>

        <DelayedPopover placement="left">
          <div class="fontOptionsList" :class="{ isDark: isDark }">
            <div
              class="fontOptionItem"
              v-for="item in alignList"
              :key="item.value"
              :class="{ active: formatInfo.align === item.value }"
              @mousedown.prevent.stop
              @click.stop="changeTextAlign(item.value)"
            >
              {{ item.name }}
            </div>
          </div>
          <div class="formatRow" slot="reference" @mousedown.prevent.stop>
            <span class="icon iconfont iconjuzhongduiqi"></span>
            <span class="label">{{ $t('richTextToolbar.textAlign') || '对齐' }}</span>
            <span class="valueText">{{ getAlignLabel(formatInfo.align) }}</span>
          </div>
        </DelayedPopover>

        <div class="divider"></div>

        <div class="formatRow" @mousedown.prevent.stop @click.stop="removeFormat">
          <span class="icon iconfont iconqingchu"></span>
          <span class="label">{{ $t('richTextToolbar.removeFormat') || '清除样式' }}</span>
        </div>
      </template>

      <div class="noSelectionHint" v-else>
        <span class="hintIcon iconfont iconbianji1"></span>
        <span>{{ $t('richTextToolbar.selectNodeHint') || '请先选中一个节点' }}</span>
      </div>
    </div>
  </Sidebar>
</template>

<script>
import Sidebar from './Sidebar.vue'
import Color from './Color.vue'
import { fontFamilyList, fontSizeList, alignList } from '@/config'
import { mapMutations, mapState } from 'vuex'
import sidebarPanelDebug from '@/mixins/sidebarPanelDebug'

export default {
  mixins: [sidebarPanelDebug],
  components: {
    Sidebar,
    Color,
    DelayedPopover: () => import('@/components/DelayedPopover.vue')
  },
  props: {
    mindMap: { type: Object }
  },
  data() {
    return {
      fontSizeList,
      hasRange: false,
      hasActiveNode: false,
      formatInfo: {},
      fontColor: '',
      fontBackgroundColor: ''
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark,
      activeSidebar: state => state.activeSidebar
    }),
    showFloatingToolbarOnSelection: {
      get() {
        return !!this.$store.state.localConfig.showRichTextToolbarOnSelection
      },
      set(val) {
        this.setLocalConfig({
          showRichTextToolbarOnSelection: !!val
        })
      }
    },
    hasTextTarget() {
      return this.hasRange || this.hasActiveNode
    },
    fontFamilyList() {
      return fontFamilyList[this.$i18n.locale] || fontFamilyList.zh
    },
    alignList() {
      return alignList[this.$i18n.locale] || alignList.zh
    }
  },
  watch: {
    activeSidebar(val, oldVal) {
      this.logSidebarPanelWatch('textFormat', val, oldVal)
      if (val === 'textFormat') {
        this.$refs.sidebar.show = true
        this.syncActiveNode()
        this.logSidebarPanelWatch('textFormat', val, oldVal, { branch: 'show-true' })
      } else {
        this.$refs.sidebar.show = false
        this.logSidebarPanelWatch('textFormat', val, oldVal, { branch: 'show-false' })
      }
    }
  },
  mounted() {
    this.logSidebarPanelMounted('textFormat')
    if (this.activeSidebar === 'textFormat' && this.$refs.sidebar) {
      this.$refs.sidebar.show = true
    }
  },
  created() {
    this.logSidebarPanelCreated('textFormat')
    this.$bus.$on('rich_text_selection_change', this.onRichTextSelectionChange)
    this.$bus.$on('node_active', this.onNodeActive)
    this.syncActiveNode()
  },
  beforeDestroy() {
    this.$bus.$off('rich_text_selection_change', this.onRichTextSelectionChange)
    this.$bus.$off('node_active', this.onNodeActive)
  },
  methods: {
    ...mapMutations(['setLocalConfig']),

    syncActiveNode() {
      if (!this.mindMap || !this.mindMap.renderer) {
        this.hasActiveNode = false
        return
      }
      this.hasActiveNode = (this.mindMap.renderer.activeNodeList || []).length > 0
    },

    onNodeActive(node, nodes) {
      this.hasActiveNode = (nodes || []).length > 0
    },

    onRichTextSelectionChange(hasRange, rect, formatInfo) {
      if (hasRange) {
        this.formatInfo = { ...(formatInfo || {}) }
        this.fontColor = formatInfo.color || ''
        this.fontBackgroundColor = formatInfo.background || ''
      }
      this.hasRange = hasRange
    },

    formatRichText(config = {}, clear = false) {
      if (!this.mindMap || !this.mindMap.richText) return
      if (this.hasRange) {
        this.mindMap.richText.formatText(config, clear)
      } else {
        this.mindMap.richText.formatActiveNodeText(config, clear)
      }
    },

    toggleBold() {
      this.formatInfo.bold = !this.formatInfo.bold
      this.formatRichText({ bold: this.formatInfo.bold })
    },

    toggleItalic() {
      this.formatInfo.italic = !this.formatInfo.italic
      this.formatRichText({ italic: this.formatInfo.italic })
    },

    toggleUnderline() {
      this.formatInfo.underline = !this.formatInfo.underline
      this.formatRichText({ underline: this.formatInfo.underline })
    },

    toggleStrike() {
      this.formatInfo.strike = !this.formatInfo.strike
      this.formatRichText({ strike: this.formatInfo.strike })
    },

    changeFontFamily(font) {
      this.formatInfo.font = font
      this.formatRichText({ font })
    },

    changeFontSize(size) {
      this.formatInfo.size = size + 'px'
      this.formatRichText({ size: size + 'px' })
    },

    changeFontColor(color) {
      this.formatInfo.color = color
      this.fontColor = color
      this.formatRichText({ color })
    },

    changeFontBackgroundColor(background) {
      this.formatInfo.background = background
      this.fontBackgroundColor = background
      this.formatRichText({ background })
    },

    changeTextAlign(align) {
      this.formatInfo.align = align
      this.formatRichText({ align })
    },

    removeFormat() {
      this.formatRichText({}, true)
    },

    getFontFamilyLabel(font) {
      const item = this.fontFamilyList.find(item => item.value === font)
      return item ? item.name : ''
    },

    getAlignLabel(align) {
      const item = this.alignList.find(item => item.value === align)
      return item ? item.name : ''
    }
  }
}
</script>

<style lang="less" scoped>
.sidebarContent {
  padding: 6px 0;

  &.isDark {
    .toolbarSwitchRow {
      border-bottom-color: hsla(0, 0%, 100%, 0.08);
    }
    .formatRow {
      color: hsla(0, 0%, 100%, 0.7);
      &:hover { background: hsla(0, 0%, 100%, 0.05); }
      &.active { color: #67c23a; background: hsla(0, 0%, 100%, 0.05); }
    }
    .fontOptionItem {
      color: hsla(0, 0%, 100%, 0.6);
      &:hover { background: hsla(0, 0%, 100%, 0.05); }
      &.active { color: #67c23a; }
    }
    .divider { border-color: hsla(0, 0%, 100%, 0.08); }
    .noSelectionHint { color: hsla(0, 0%, 100%, 0.4); }
  }

  .toolbarSwitchRow {
    padding: 10px 16px 12px;
    border-bottom: 1px solid #f0f0f0;
    margin-bottom: 4px;
  }

  .formatRow {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    cursor: pointer;
    transition: all 0.15s;

    &:hover { background: #f5f5f5; }
    &.active {
      color: #12bb37;
    }
    .icon { font-size: 18px; width: 22px; text-align: center; flex-shrink: 0; }
    .icon.fontColor { font-size: 24px; }
    .label { font-size: 13px; flex: 1; }
    .valueText {
      max-width: 110px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
      color: #999;
    }
    .colorPreview {
      width: 18px;
      height: 18px;
      border: 1px solid #ddd;
      border-radius: 3px;
      background-image:
        linear-gradient(45deg, #ddd 25%, transparent 25%),
        linear-gradient(-45deg, #ddd 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #ddd 75%),
        linear-gradient(-45deg, transparent 75%, #ddd 75%);
      background-size: 8px 8px;
      background-position: 0 0, 0 4px, 4px -4px, -4px 0;
    }
  }

  .divider {
    border-top: 1px solid #f0f0f0;
    margin: 4px 16px;
  }

  .noSelectionHint {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 40px 20px;
    color: #999;
    font-size: 13px;
    text-align: center;

    .hintIcon { font-size: 28px; opacity: 0.5; }
  }
}

.fontOptionsList {
  width: 150px;

  &.isDark {
    .fontOptionItem {
      color: #fff;

      &:hover {
        background-color: hsla(0, 0%, 100%, 0.05);
      }
    }
  }

  .fontOptionItem {
    height: 30px;
    width: 100%;
    display: flex;
    align-items: center;
    cursor: pointer;

    &:hover {
      background-color: #f7f7f7;
    }

    &.active {
      color: #12bb37;
    }
  }
}
</style>
