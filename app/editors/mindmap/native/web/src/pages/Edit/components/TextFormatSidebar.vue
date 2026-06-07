<template>
  <Sidebar ref="sidebar" :title="$t('richTextToolbar.title') || '文本格式'">
    <div class="sidebarContent customScrollbar" :class="{ isDark: isDark }">
      <template v-if="hasTextSelection">
        <!-- 文字样式 -->
        <div class="title noTop">{{ $t('richTextToolbar.textFormat') || '文字样式' }}</div>
        <div class="row formatBlock">
          <div class="fmtBtn" :class="{ active: formatInfo.bold }" @click="toggleBold">
            <span class="icon iconfont iconzitijiacu"></span>
            <span class="fmtLabel">{{ $t('richTextToolbar.bold') || '加粗' }}</span>
          </div>
        </div>
        <div class="row formatBlock">
          <div class="fmtBtn" :class="{ active: formatInfo.italic }" @click="toggleItalic">
            <span class="icon iconfont iconzitixieti"></span>
            <span class="fmtLabel">{{ $t('richTextToolbar.italic') || '斜体' }}</span>
          </div>
        </div>
        <div class="row formatBlock">
          <div class="fmtBtn" :class="{ active: formatInfo.underline }" @click="toggleUnderline">
            <span class="icon iconfont iconzitixiahuaxian"></span>
            <span class="fmtLabel">{{ $t('richTextToolbar.underline') || '下划线' }}</span>
          </div>
        </div>
        <div class="row formatBlock">
          <div class="fmtBtn" :class="{ active: formatInfo.strike }" @click="toggleStrike">
            <span class="icon iconfont iconshanchuxian"></span>
            <span class="fmtLabel">{{ $t('richTextToolbar.strike') || '删除线' }}</span>
          </div>
        </div>
        <div class="row formatBlock">
          <div class="fmtBtn" @click="removeFormat">
            <span class="icon iconfont iconqingchu"></span>
            <span class="fmtLabel">{{ $t('richTextToolbar.removeFormat') || '清除样式' }}</span>
          </div>
        </div>

        <!-- 字体与字号 -->
        <div class="title">{{ $t('style.fontFamily') || '字体' }} / {{ $t('style.fontSize') || '字号' }}</div>
        <div class="row">
          <div class="rowItem">
            <span class="name">{{ $t('style.fontFamily') || '字体' }}</span>
            <el-select size="mini" style="width: 130px" v-model="formatInfo.font" @change="changeFontFamily">
              <el-option v-for="item in fontFamilyList" :key="item.value" :label="item.name" :value="item.value" :style="{ fontFamily: item.value }"></el-option>
            </el-select>
          </div>
        </div>
        <div class="row">
          <div class="rowItem">
            <span class="name">{{ $t('style.fontSize') || '字号' }}</span>
            <el-select size="mini" style="width: 80px" v-model="selectedFontSize" @change="changeFontSize">
              <el-option v-for="item in fontSizeList" :key="item" :label="item + 'px'" :value="item"></el-option>
            </el-select>
          </div>
        </div>

        <!-- 颜色 -->
        <div class="title">{{ $t('richTextToolbar.color') || '颜色' }}</div>
        <div class="row">
          <div class="rowItem">
            <span class="name">{{ $t('richTextToolbar.color') || '字色' }}</span>
            <el-color-picker size="mini" v-model="fontColor" @change="changeFontColor"></el-color-picker>
          </div>
        </div>
        <div class="row">
          <div class="rowItem">
            <span class="name">{{ $t('richTextToolbar.backgroundColor') || '背景色' }}</span>
            <el-color-picker size="mini" v-model="fontBackgroundColor" @change="changeFontBackgroundColor"></el-color-picker>
          </div>
        </div>

        <!-- 对齐 -->
        <div class="title">{{ $t('richTextToolbar.textAlign') || '对齐' }}</div>
        <div class="row">
          <div class="rowItem">
            <el-select size="mini" style="width: 100px" v-model="formatInfo.align" @change="changeTextAlign">
              <el-option v-for="item in alignList" :key="item.value" :label="item.name" :value="item.value"></el-option>
            </el-select>
          </div>
        </div>
      </template>

      <!-- 未选中文字时的提示 -->
      <div class="noSelectionHint" v-else>
        <span class="hintIcon iconfont iconbianji1"></span>
        <span>{{ $t('richTextToolbar.selectTextHint') || '双击节点并选中文字后可编辑格式' }}</span>
      </div>
    </div>
  </Sidebar>
</template>

<script>
import Sidebar from './Sidebar.vue'
import { fontFamilyList, fontSizeList, alignList } from '@/config'
import { mapState } from 'vuex'

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
      selectedFontSize: 14
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark,
      activeSidebar: state => state.activeSidebar
    }),
    fontFamilyList() {
      return fontFamilyList[this.$i18n.locale] || fontFamilyList.zh
    },
    alignList() {
      return alignList[this.$i18n.locale] || alignList.zh
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
  },
  beforeDestroy() {
    this.$bus.$off('rich_text_selection_change', this.onRichTextSelectionChange)
  },
  methods: {
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
    .fmtBtn {
      color: hsla(0, 0%, 100%, 0.7);
      border-bottom-color: hsla(0, 0%, 100%, 0.08);
      &:hover { background: hsla(0, 0%, 100%, 0.05); }
      &.active { color: #67c23a; background: hsla(0, 0%, 100%, 0.05); }
    }
    .noSelectionHint { color: hsla(0, 0%, 100%, 0.4); }
  }

  .title {
    font-size: 14px;
    font-weight: 500;
    margin-top: 20px;
    margin-bottom: 10px;

    &.noTop { margin-top: 0; }
  }

  .row {
    margin-bottom: 4px;
  }

  .rowItem {
    display: flex;
    align-items: center;
    margin-bottom: 6px;

    .name {
      font-size: 12px;
      color: #999;
      margin-right: 10px;
      white-space: nowrap;
      min-width: 36px;
    }
  }

  .formatBlock {
    margin-bottom: 0;

    .fmtBtn {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 6px;
      cursor: pointer;
      border-bottom: 1px solid #f0f0f0;
      transition: all 0.15s;

      &:hover { background: #f8f8f8; }
      &.active {
        color: #12bb37;
        background: #f0fbf0;
      }

      .icon { font-size: 16px; width: 20px; text-align: center; }
      .fmtLabel { font-size: 13px; }
    }
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
</style>
