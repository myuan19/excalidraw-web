<template>
  <div class="nodePreviewRoot" :class="{ isDark: isDark }">
    <div class="nodeStyleHeader" v-if="show">
      <div class="nodePreviewStage" :style="stageStyle">
        <svg
          v-if="node"
          ref="previewSvg"
          class="nodePreviewSvg"
          preserveAspectRatio="xMidYMid meet"
        ></svg>
        <slot v-else />
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
    },
    node: {
      type: Object,
      default: null
    }
  },
  computed: {
    stageStyle() {
      return buildCanvasStageStyle(this.mindMap, { isDark: this.isDark })
    }
  },
  watch: {
    node() {
      this.scheduleRenderNodePreview()
    },
    show(value) {
      if (value) {
        this.scheduleRenderNodePreview()
      }
    }
  },
  mounted() {
    this.scheduleRenderNodePreview()
    if (this.mindMap && typeof this.mindMap.on === 'function') {
      this.mindMap.on('node_tree_render_end', this.scheduleRenderNodePreview)
    }
  },
  beforeDestroy() {
    if (this.mindMap && typeof this.mindMap.off === 'function') {
      this.mindMap.off('node_tree_render_end', this.scheduleRenderNodePreview)
    }
  },
  methods: {
    scheduleRenderNodePreview() {
      this.$nextTick(() => {
        this.renderNodePreview()
      })
    },
    clearPreviewSvg(svg) {
      while (svg && svg.firstChild) {
        svg.removeChild(svg.firstChild)
      }
    },
    cloneSvgDefs(svg) {
      const sourceSvg =
        this.mindMap && this.mindMap.svg && this.mindMap.svg.node
          ? this.mindMap.svg.node
          : null
      const defs = sourceSvg ? sourceSvg.querySelector('defs') : null
      if (defs) {
        svg.appendChild(defs.cloneNode(true))
      }
    },
    cleanClonedNode(clone) {
      clone.classList.remove('smm-node-dragging', 'smm-node-highlight')
      clone.removeAttribute('transform')
      clone
        .querySelectorAll(
          '.smm-expand-btn, .smm-quick-create-child-btn'
        )
        .forEach(item => {
          item.parentNode && item.parentNode.removeChild(item)
        })
    },
    renderNodePreview() {
      const svg = this.$refs.previewSvg
      if (!svg) return
      this.clearPreviewSvg(svg)
      const node = this.node
      if (!node || !node.group || !node.group.node) {
        return
      }
      const width = Math.max(1, Math.ceil(node.width || 0))
      const height = Math.max(1, Math.ceil(node.height || 0))
      const padding = 10
      svg.setAttribute(
        'viewBox',
        `${-padding} ${-padding} ${width + padding * 2} ${height + padding * 2}`
      )
      this.cloneSvgDefs(svg)
      const clone = node.group.node.cloneNode(true)
      this.cleanClonedNode(clone)
      svg.appendChild(clone)
    }
  }
}
</script>

<style lang="less" scoped>
@import '@/styles/nodePreview.less';
</style>
