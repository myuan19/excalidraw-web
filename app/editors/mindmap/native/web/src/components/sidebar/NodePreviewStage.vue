<template>
  <div class="nodePreviewRoot" :class="{ isDark: isDark }">
    <div class="nodeStyleHeader" v-if="show">
      <div class="nodePreviewStage" :style="stageStyle">
        <slot />
      </div>
    </div>
  </div>
</template>

<script>
import { buildCanvasStageStyle } from '@/utils/nodePreviewStyle'

/** 侧栏节点预览区：画布背景 + 默认插槽（节点芯片） */
export default {
  name: 'NodePreviewStage',
  props: {
    mindMap: {
      type: Object,
      default: null
    },
    isDark: {
      type: Boolean,
      default: false
    },
    show: {
      type: Boolean,
      default: true
    }
  },
  computed: {
    stageStyle() {
      return buildCanvasStageStyle(this.mindMap, { isDark: this.isDark })
    }
  }
}
</script>

<style lang="less" scoped>
@import '@/styles/nodePreview.less';
</style>
