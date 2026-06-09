<template>
  <div
    class="sidebarContainer"
    @click.stop
    :class="{
      show: isPanelVisible,
      isDark: isDark,
      instantSwitch: shouldSkipOpenTransition
    }"
    :style="{
      zIndex: Math.max(zIndex, sidebarUiZIndexBase)
    }"
  >
    <span class="closeBtn el-icon-close" @click.stop="close"></span>
    <div class="sidebarHeader" v-if="title">
      {{ title }}
    </div>
    <div class="sidebarContent customScrollbar" ref="sidebarContent">
      <slot></slot>
    </div>
  </div>
</template>

<script>
import { store } from '@/config'
import { mapState, mapMutations } from 'vuex'
import {
  sidebarDebug,
  sidebarDebugPanelShow,
  sidebarMemoryDebug
} from '@/utils/sidebarDebug'
import { editHistoryDebug } from '@/utils/editHistoryDebug'
import {
  SIDEBAR_PANEL_WIDTH,
  SIDEBAR_UI_Z_INDEX_BASE
} from '@/utils/sidebarLayout'

export default {
  props: {
    title: {
      type: String,
      default: ''
    },
    panelKey: {
      type: String,
      default: ''
    }
  },
  data() {
    return {
      zIndex: SIDEBAR_UI_Z_INDEX_BASE,
      sidebarUiZIndexBase: SIDEBAR_UI_Z_INDEX_BASE,
      sidebarPanelWidth: SIDEBAR_PANEL_WIDTH
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark,
      previousActiveSidebar: state => state.previousActiveSidebar,
      activeSidebar: state => state.activeSidebar
    }),

    isPanelVisible() {
      return !!(this.panelKey && this.activeSidebar === this.panelKey)
    },

    shouldSkipOpenTransition() {
      return !!(
        this.isPanelVisible &&
        this.previousActiveSidebar &&
        this.previousActiveSidebar !== this.panelKey
      )
    },

    // 兼容旧面板代码中对 show 的赋值，可见性由 activeSidebar + panelKey 统一决定
    show: {
      get() {
        return this.isPanelVisible
      },
      set() {}
    }
  },
  watch: {
    isPanelVisible(val, oldVal) {
      sidebarDebugPanelShow(this.panelKey || this.title, oldVal, val, {
        activeSidebar: this.activeSidebar || null,
        previousActiveSidebar: this.previousActiveSidebar || null,
        zIndex: this.zIndex
      })
      if (val && !oldVal) {
        this.zIndex = store.sidebarZIndex++
        editHistoryDebug('sidebar opened', {
          panelKey: this.panelKey || this.title,
          zIndex: this.zIndex
        })
        sidebarDebug('panel opened', {
          panelKey: this.panelKey || this.title,
          zIndex: this.zIndex,
          activeSidebar: this.activeSidebar || null
        })
        sidebarMemoryDebug('panel open', {
          panelKey: this.panelKey || this.title
        })
        if (this.shouldSkipOpenTransition) {
          this.skipOpenTransition()
        }
      } else if (!val && oldVal) {
        sidebarDebug('panel hidden', {
          panelKey: this.panelKey || this.title,
          activeSidebar: this.activeSidebar || null
        })
        sidebarMemoryDebug('panel hide', {
          panelKey: this.panelKey || this.title
        })
      }
    }
  },
  created() {
    sidebarDebug('sidebar shell created', {
      panelKey: this.panelKey || this.title
    })
    sidebarMemoryDebug('shell created', {
      panelKey: this.panelKey || this.title
    })
    this.$bus.$on('closeSideBar', this.handleCloseSidebar)
  },
  mounted() {
    sidebarDebug('sidebar shell mounted', {
      panelKey: this.panelKey || this.title,
      visible: this.isPanelVisible
    })
    if (this.isPanelVisible) {
      if (!this.zIndex) {
        this.zIndex = store.sidebarZIndex++
      }
      this.skipOpenTransition()
    }
  },
  beforeDestroy() {
    sidebarMemoryDebug('shell destroy', {
      panelKey: this.panelKey || this.title
    })
    this.$bus.$off('closeSideBar', this.handleCloseSidebar)
  },
  methods: {
    ...mapMutations(['setActiveSidebar']),

    skipOpenTransition() {
      if (!this.$el) return
      this.$el.style.transition = 'none'
      void this.$el.offsetHeight
      this.$nextTick(() => {
        if (this.$el) {
          this.$el.style.transition = ''
        }
      })
    },

    handleCloseSidebar(targetKey) {
      sidebarDebug('handleCloseSidebar', {
        panelKey: this.panelKey || this.title,
        targetKey: targetKey || null,
        visible: this.isPanelVisible,
        activeSidebar: this.activeSidebar || null
      })
      if (targetKey && this.panelKey && targetKey !== this.panelKey) {
        sidebarDebug('skip closeSideBar key mismatch', {
          panelKey: this.panelKey,
          targetKey
        })
        return
      }
      if (!this.isPanelVisible) {
        sidebarDebug('ignore closeSideBar for hidden panel', {
          panelKey: this.panelKey || this.title,
          targetKey: targetKey || null
        })
        return
      }
      this.close(targetKey ? 'bus' : 'close-btn')
    },

    close(source = 'close-btn') {
      sidebarDebug('sidebar close called', {
        panelKey: this.panelKey || this.title,
        source,
        wasVisible: this.isPanelVisible,
        activeSidebar: this.activeSidebar || null
      })
      this.setActiveSidebar(null)
    },

    getEl() {
      return this.$refs.sidebarContent
    }
  }
}
</script>

<style lang="less" scoped>
.sidebarContainer {
  position: fixed;
  right: -300px;
  top: 0;
  bottom: 0;
  width: 300px; // 与 SIDEBAR_PANEL_WIDTH 保持一致
  height: 100vh;
  z-index: 10100; // 与 SIDEBAR_UI_Z_INDEX_BASE 保持一致
  background-color: #fff;
  border-left: 1px solid #e8e8e8;
  display: flex;
  flex-direction: column;
  transition: all 0.3s;

  &.isDark {
    background-color: #262a2e;
    border-left-color: hsla(0, 0%, 100%, 0.1);

    .sidebarHeader {
      border-bottom-color: hsla(0, 0%, 100%, 0.1);
      color: #fff;
    }

    .closeBtn {
      color: #fff;
    }
  }

  &.show {
    right: 0;
  }

  &.instantSwitch {
    transition: none;
  }

  .closeBtn {
    position: absolute;
    right: 20px;
    top: 12px;
    font-size: 20px;
    cursor: pointer;
    z-index: 3;
  }

  .sidebarHeader {
    width: 100%;
    height: 44px;
    border-bottom: 1px solid #e8e8e8;
    display: flex;
    justify-content: center;
    align-items: center;
    flex-grow: 0;
    flex-shrink: 0;
  }

  .sidebarContent {
    width: 100%;
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
}
</style>
