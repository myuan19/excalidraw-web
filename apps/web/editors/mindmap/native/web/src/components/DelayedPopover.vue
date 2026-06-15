<template>
  <span
    class="delayedPopoverWrap"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
    @click.stop="onReferenceClick"
  >
    <el-popover
      ref="popover"
      :placement="placement"
      :width="width"
      :popper-class="popperClass"
      trigger="manual"
      v-model="visible"
      @show="onPopoverShow"
      @hide="onPopoverHide"
    >
      <!-- reference 必须放进 el-popover 的 reference 插槽，popper 才有定位锚点 -->
      <template slot="reference">
        <slot name="reference"></slot>
      </template>
      <!-- 弹层挂在 body 下，单独阻止 mousedown 夺焦，保留编辑器文本选区 -->
      <div
        class="delayedPopoverContent"
        v-keep-text-selection
        @click="onContentClick"
      >
        <slot></slot>
      </div>
    </el-popover>
  </span>
</template>

<script>
import keepTextSelection from '@/directives/keepTextSelection'

const OPEN_DELAY_MS = 600

export default {
  name: 'DelayedPopover',
  directives: {
    keepTextSelection
  },
  props: {
    placement: {
      type: String,
      default: 'bottom'
    },
    width: {
      type: [String, Number],
      default: undefined
    },
    popperClass: {
      type: String,
      default: ''
    },
    openDelay: {
      type: Number,
      default: OPEN_DELAY_MS
    },
    closeOnSelect: {
      type: Boolean,
      default: true
    }
  },
  data() {
    return {
      visible: false,
      pinned: false,
      hoveringWrap: false,
      hoveringPopper: false,
      openTimer: null
    }
  },
  mounted() {
    document.addEventListener('click', this.onDocumentClick, true)
  },
  beforeDestroy() {
    this.clearOpenTimer()
    document.removeEventListener('click', this.onDocumentClick, true)
    this.unbindPopperMouseEvents()
  },
  methods: {
    clearOpenTimer() {
      if (this.openTimer) {
        clearTimeout(this.openTimer)
        this.openTimer = null
      }
    },

    scheduleOpen() {
      this.clearOpenTimer()
      if (this.pinned || this.visible) {
        return
      }
      this.openTimer = setTimeout(() => {
        this.openTimer = null
        if (this.pinned || this.hoveringWrap || this.hoveringPopper) {
          this.visible = true
        }
      }, this.openDelay)
    },

    close() {
      this.pinned = false
      this.visible = false
    },

    onMouseEnter() {
      this.hoveringWrap = true
      if (this.pinned) {
        return
      }
      this.scheduleOpen()
    },

    onMouseLeave() {
      this.hoveringWrap = false
      this.clearOpenTimer()
      if (!this.pinned && !this.hoveringPopper) {
        this.visible = false
      }
    },

    onReferenceClick() {
      this.clearOpenTimer()
      this.pinned = true
      this.visible = true
    },

    onContentClick() {
      if (!this.closeOnSelect || !this.pinned) {
        return
      }
      this.$nextTick(() => {
        this.close()
      })
    },

    onPopoverShow() {
      this.$nextTick(() => {
        this.bindPopperMouseEvents()
      })
    },

    onPopoverHide() {
      this.unbindPopperMouseEvents()
      this.hoveringPopper = false
    },

    bindPopperMouseEvents() {
      const popper = this.getPopperEl()
      if (!popper || popper.__delayedPopoverBound) {
        return
      }
      popper.__delayedPopoverBound = true
      popper.addEventListener('mouseenter', this.onPopperEnter)
      popper.addEventListener('mouseleave', this.onPopperLeave)
    },

    unbindPopperMouseEvents() {
      const popper = this.getPopperEl()
      if (!popper || !popper.__delayedPopoverBound) {
        return
      }
      popper.removeEventListener('mouseenter', this.onPopperEnter)
      popper.removeEventListener('mouseleave', this.onPopperLeave)
      popper.__delayedPopoverBound = false
    },

    getPopperEl() {
      const popover = this.$refs.popover
      return popover && popover.$refs ? popover.$refs.popper : null
    },

    onPopperEnter() {
      this.hoveringPopper = true
    },

    onPopperLeave() {
      this.hoveringPopper = false
      if (!this.pinned && !this.hoveringWrap) {
        this.visible = false
      }
    },

    onDocumentClick(event) {
      if (!this.visible || !this.pinned) {
        return
      }
      const popper = this.getPopperEl()
      if (
        this.$el.contains(event.target) ||
        (popper && popper.contains(event.target))
      ) {
        return
      }
      this.close()
    }
  }
}
</script>

<style lang="less" scoped>
.delayedPopoverWrap {
  display: inline-block;
  vertical-align: middle;
}
</style>
