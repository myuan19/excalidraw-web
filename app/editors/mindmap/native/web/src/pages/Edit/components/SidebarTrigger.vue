<template>
  <div
    class="sidebarTriggerContainer"
    @click.stop
    :class="{
      panelOpen: triggerPanelOpen,
      sidebarOpen: !!activeSidebar,
      dockAtSidebar: dockAtSidebarEdge,
      dockAtScreen: dockAtScreenEdge,
      isDark: isDark
    }"
    :style="containerStyle"
  >
    <div
      class="toggleShowBtn"
      :class="{ collapsed: !triggerPanelOpen }"
      @click="onToggleClick"
    >
      <span class="iconfont iconjiantouyou"></span>
    </div>
    <div class="trigger customScrollbar" v-show="triggerPanelOpen">
      <div
        class="triggerItem"
        v-for="item in triggerList"
        :key="item.value"
        :class="{ active: activeSidebar === item.value }"
        @click="trigger(item)"
      >
        <div class="triggerIcon iconfont" :class="[item.icon]"></div>
        <div class="triggerName">{{ item.name }}</div>
      </div>
    </div>
  </div>
</template>

<script>
import { mapState, mapMutations } from 'vuex'
import { sidebarTriggerList } from '@/config'
import { getSidebarTopMargin, SIDEBAR_BOTTOM_MARGIN } from '@/utils/sidebarLayout'

// 侧边栏触发器
export default {
  data() {
    return {
      triggerPanelOpen: true,
      maxHeight: 0,
      topMargin: 110
    }
  },
  computed: {
    containerStyle() {
      return {
        maxHeight: `${this.maxHeight}px`,
        top: `${this.topMargin}px`
      }
    },
    dockAtSidebarEdge() {
      return !!this.activeSidebar && !this.triggerPanelOpen
    },
    dockAtScreenEdge() {
      return !this.activeSidebar && !this.triggerPanelOpen
    },
    ...mapState({
      isDark: state => state.localConfig.isDark,
      activeSidebar: state => state.activeSidebar,
      isReadonly: state => state.isReadonly,
      enableAi: state => state.localConfig.enableAi
    }),

    triggerList() {
      let list = sidebarTriggerList[this.$i18n.locale] || sidebarTriggerList.zh
      if (this.isReadonly) {
        list = list.filter(item => {
          return ['outline', 'shortcutKey', 'ai'].includes(item.value)
        })
      }
      if (!this.enableAi) {
        list = list.filter(item => {
          return item.value !== 'ai'
        })
      }
      return list
    }
  },
  watch: {
    isReadonly(val) {
      if (val) {
        this.setActiveSidebar(null)
      }
    }
  },
  mounted() {
    this.$nextTick(() => {
      this.updateSize()
    })
  },
  created() {
    window.addEventListener('resize', this.onResize)
    this.updateSize()
  },
  beforeDestroy() {
    window.removeEventListener('resize', this.onResize)
  },
  methods: {
    ...mapMutations(['setActiveSidebar']),

    onToggleClick() {
      if (this.activeSidebar && !this.triggerPanelOpen) {
        this.setActiveSidebar(null)
        this.$bus.$emit('closeSideBar')
        return
      }
      this.triggerPanelOpen = !this.triggerPanelOpen
    },

    trigger(item) {
      this.setActiveSidebar(item.value)
    },

    onResize() {
      this.updateSize()
    },

    updateSize() {
      this.topMargin = getSidebarTopMargin()
      this.maxHeight =
        window.innerHeight - this.topMargin - SIDEBAR_BOTTOM_MARGIN
    }
  }
}
</script>

<style lang="less" scoped>
.sidebarTriggerContainer {
  position: fixed;
  right: -60px;
  bottom: 80px;
  transition: right 0.3s ease;
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: visible;
  z-index: 20;

  &.isDark {
    .trigger {
      background-color: #262a2e;

      .triggerItem {
        color: hsla(0, 0%, 100%, 0.6);

        &:hover {
          background-color: hsla(0, 0%, 100%, 0.05);
        }
      }
    }
  }

  &.panelOpen:not(.sidebarOpen) {
    right: 0;
  }

  &.panelOpen.sidebarOpen {
    right: 305px;
  }

  &.dockAtScreen {
    right: 0;
    width: 0;
  }

  &.dockAtSidebar {
    right: 300px;
    width: 0;
  }

  .toggleShowBtn {
    position: absolute;
    left: -14px;
    width: 14px;
    height: 48px;
    background: #409eff;
    top: 50%;
    transform: translateY(-50%);
    cursor: pointer;
    transition: background 0.15s ease, box-shadow 0.15s ease;
    z-index: 2;
    border-top-left-radius: 6px;
    border-bottom-left-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    box-shadow: 0 1px 6px rgba(64, 158, 255, 0.22);

    &.collapsed span {
      transform: rotateZ(180deg);
    }

    &:hover {
      background: #66b1ff;
      box-shadow: 0 2px 8px rgba(64, 158, 255, 0.32);
    }

    span {
      color: #fff;
      font-size: 10px;
      transition: transform 0.15s ease;
    }
  }

  .trigger {
    position: relative;
    z-index: 3;
    width: 60px;
    border-color: #eee;
    background-color: #fff;
    box-shadow: 0 2px 16px 0 rgba(0, 0, 0, 0.06);
    border-radius: 6px;
    max-height: 100%;
    overflow-y: auto;
    overflow-x: hidden;

    .triggerItem {
      height: 60px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      cursor: pointer;
      color: #464646;
      user-select: none;
      white-space: nowrap;

      &:hover {
        background-color: #ededed;
      }

      &.active {
        color: #409eff;
        font-weight: bold;
      }

      .triggerIcon {
        font-size: 18px;
        margin-bottom: 5px;
      }

      .triggerName {
        font-size: 13px;
      }
    }
  }
}
</style>
