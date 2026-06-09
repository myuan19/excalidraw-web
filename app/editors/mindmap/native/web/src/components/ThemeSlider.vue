<template>
  <div
    class="rowItem sliderWrap"
    :class="{ hasLabel: label }"
    @mouseleave="hideTooltip"
  >
    <span v-if="label" class="name">{{ label }}</span>
    <el-slider
      :style="{ width: width }"
      :value="value"
      :min="min"
      :max="max"
      :step="step"
      :show-tooltip="tooltipVisible"
      v-bind="extraAttrs"
      @mouseenter.native="showTooltip"
      @mousedown.native="onDragStart"
      @touchstart.native="onDragStart"
      @mouseup.native="hideTooltip"
      @input="onInput"
      @change="onChange"
    ></el-slider>
  </div>
</template>

<script>
import { beginDragSession, endDragSession } from '@/utils/editHistory/dragSession'

export default {
  inheritAttrs: false,
  props: {
    mindMap: {
      type: Object,
      default: null
    },
    value: {
      type: Number,
      default: 0
    },
    label: {
      type: String,
      default: ''
    },
    width: {
      type: String,
      default: '200px'
    },
    min: {
      type: Number,
      default: 0
    },
    max: {
      type: Number,
      default: 100
    },
    step: {
      type: Number,
      default: 1
    }
  },
  data() {
    return {
      tooltipVisible: false,
      dragActive: false
    }
  },
  computed: {
    extraAttrs() {
      const { value, label, width, min, max, step, ...rest } = this.$attrs
      return rest
    }
  },
  mounted() {
    this._onPointerEnd = () => {
      if (this.dragActive) {
        this.endDrag()
      }
    }
    document.addEventListener('mouseup', this._onPointerEnd)
    document.addEventListener('touchend', this._onPointerEnd)
  },
  beforeDestroy() {
    document.removeEventListener('mouseup', this._onPointerEnd)
    document.removeEventListener('touchend', this._onPointerEnd)
    this.endDrag()
  },
  methods: {
    showTooltip() {
      this.tooltipVisible = true
    },
    hideTooltip() {
      this.tooltipVisible = false
    },
    onDragStart() {
      if (!this.mindMap || this.dragActive) {
        return
      }
      this.dragActive = beginDragSession(this.mindMap, { label: this.label })
    },
    endDrag() {
      if (!this.dragActive) {
        return
      }
      endDragSession(this.mindMap, { label: this.label })
      this.dragActive = false
    },
    onInput(val) {
      this.showTooltip()
      this.$emit('input', val)
    },
    onChange(val) {
      this.hideTooltip()
      this.endDrag()
      this.$emit('change', val)
    }
  }
}
</script>

<style lang="less" scoped>
.sliderWrap {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;

  .name {
    flex: 0 0 auto;
    margin-right: 18px;
    font-size: 12px;
    line-height: 1;
    white-space: nowrap;
  }

  /deep/ .el-slider {
    min-width: 0;
  }
}
</style>
