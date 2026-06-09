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
      @click.stop.prevent="onToggleClick($event)"
    >
      <span class="iconfont iconjiantouyou"></span>
    </div>
    <div
      class="trigger customScrollbar"
      :class="{ suppressItemHover: suppressItemHover }"
      v-show="triggerPanelOpen"
    >
      <div
        class="triggerItem"
        v-for="item in triggerList"
        :key="item.value"
        :class="{ active: activeSidebar === item.value }"
        @click.stop="trigger(item, $event)"
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
import { SIDEBAR_UI_Z_INDEX_TRIGGER } from '@/utils/sidebarLayout'
import {
  sidebarDebug,
  sidebarDebugClick
} from '@/utils/sidebarDebug'

// 侧边栏触发器
export default {
  data() {
    return {
      triggerPanelOpen: true,
      maxHeight: 0,
      topMargin: 0,
      suppressTriggerUntil: 0,
      suppressItemHover: false,
      lastPointer: null,
      lastTrigger: null
    }
  },
  computed: {
    containerStyle() {
      return {
        maxHeight: `${this.maxHeight}px`,
        top: `${this.topMargin}px`,
        zIndex: SIDEBAR_UI_Z_INDEX_TRIGGER
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
        sidebarDebug('readonly mode close sidebar', {
          activeSidebar: this.activeSidebar || null
        })
        this.setActiveSidebar(null)
      }
    },
    activeSidebar(val, oldVal) {
      sidebarDebug('trigger activeSidebar changed', {
        from: oldVal || null,
        to: val || null,
        triggerPanelOpenBefore: this.triggerPanelOpen,
        dockAtSidebar: this.dockAtSidebarEdge,
        dockAtScreen: this.dockAtScreenEdge
      })
      if (val && !this.triggerPanelOpen) {
        this.startHoverSuppress('active-sidebar-open')
        this.triggerPanelOpen = true
      }
    },
    triggerPanelOpen(val, oldVal) {
      sidebarDebug('trigger panel open changed', {
        from: oldVal,
        to: val,
        activeSidebar: this.activeSidebar || null
      })
    }
  },
  mounted() {
    this.$nextTick(() => {
      this.updateSize()
    })
    sidebarDebug('trigger mounted', {
      activeSidebar: this.activeSidebar || null,
      triggerPanelOpen: this.triggerPanelOpen,
      triggerCount: this.triggerList.length
    })
  },
  created() {
    window.addEventListener('resize', this.onResize)
    this.updateSize()
    this.scheduleIdleAiPrefetch()
  },
  beforeDestroy() {
    window.removeEventListener('resize', this.onResize)
    this.clearHoverSuppressListener()
  },
  methods: {
    ...mapMutations(['setActiveSidebar']),

    scheduleIdleAiPrefetch() {
      const run = () => {
        const startedAt = performance.now()
        import('./AiSidebar.vue')
          .then(() => {
            sidebarDebug('idle prefetch ai sidebar ok', {
              ms: Math.round(performance.now() - startedAt)
            })
          })
          .catch(error => {
            sidebarDebug('idle prefetch ai sidebar failed', {
              message: error && error.message
            })
          })
      }
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(run, { timeout: 8000 })
      } else {
        window.setTimeout(run, 3000)
      }
    },

    onToggleClick(event) {
      const nextOpen = !this.triggerPanelOpen
      const now = performance.now()
      this.suppressTriggerUntil = now + 220
      this.lastPointer = this.getEventPoint(event)
      sidebarDebugClick('toggle trigger panel', event, {
        from: this.triggerPanelOpen,
        to: nextOpen,
        activeSidebar: this.activeSidebar || null,
        branch: 'blue-handle-only',
        suppressTriggerUntil: Math.round(this.suppressTriggerUntil)
      })
      this.triggerPanelOpen = nextOpen
      if (nextOpen) {
        this.startHoverSuppress('blue-handle-open')
      }
    },

    startHoverSuppress(reason) {
      this.suppressItemHover = true
      this.clearHoverSuppressListener()
      this._onPointerMoveClearHoverSuppress = () => {
        sidebarDebug('clear trigger hover suppress', {
          reason,
          activeSidebar: this.activeSidebar || null
        })
        this.suppressItemHover = false
        this.clearHoverSuppressListener()
      }
      window.addEventListener(
        'pointermove',
        this._onPointerMoveClearHoverSuppress,
        { passive: true }
      )
    },

    clearHoverSuppressListener() {
      if (this._onPointerMoveClearHoverSuppress) {
        window.removeEventListener(
          'pointermove',
          this._onPointerMoveClearHoverSuppress
        )
        this._onPointerMoveClearHoverSuppress = null
      }
    },

    trigger(item, event) {
      if (this.shouldIgnoreSyntheticTrigger(item, event)) {
        return
      }
      const current = this.activeSidebar
      sidebarDebugClick('trigger item click', event, {
        item: item.value,
        itemName: item.name,
        current: current || null,
        triggerPanelOpen: this.triggerPanelOpen
      })
      if (current === item.value) {
        sidebarDebug('trigger close same item', {
          item: item.value,
          branch: 'duplicate-click-close'
        })
        this.setActiveSidebar(null)
        this.lastTrigger = this.createTriggerRecord(item, event)
        return
      }
      sidebarDebug('trigger switch item', {
        from: current || null,
        to: item.value,
        branch: 'switch-open'
      })
      this.triggerPanelOpen = true
      this.setActiveSidebar(item.value)
      this.lastTrigger = this.createTriggerRecord(item, event)
    },

    onResize() {
      this.updateSize()
    },

    updateSize() {
      this.topMargin = 0
      this.maxHeight = window.innerHeight
    },

    getEventPoint(event) {
      if (!event || typeof event.clientX !== 'number') {
        return null
      }
      return {
        x: Math.round(event.clientX),
        y: Math.round(event.clientY)
      }
    },

    isSamePointer(pointA, pointB, tolerance = 8) {
      if (!pointA || !pointB) {
        return false
      }
      return (
        Math.abs(pointA.x - pointB.x) <= tolerance &&
        Math.abs(pointA.y - pointB.y) <= tolerance
      )
    },

    createTriggerRecord(item, event) {
      return {
        item: item.value,
        time: performance.now(),
        point: this.getEventPoint(event)
      }
    },

    shouldIgnoreSyntheticTrigger(item, event) {
      const now = performance.now()
      const point = this.getEventPoint(event)
      if (
        now <= this.suppressTriggerUntil &&
        this.isSamePointer(point, this.lastPointer, 14)
      ) {
        sidebarDebugClick('ignore trigger after blue toggle', event, {
          item: item.value,
          activeSidebar: this.activeSidebar || null,
          suppressTriggerUntil: Math.round(this.suppressTriggerUntil)
        })
        return true
      }
      if (
        this.lastTrigger &&
        this.lastTrigger.item === item.value &&
        now - this.lastTrigger.time < 180 &&
        this.isSamePointer(point, this.lastTrigger.point, 14)
      ) {
        sidebarDebugClick('ignore duplicate synthetic trigger', event, {
          item: item.value,
          activeSidebar: this.activeSidebar || null,
          elapsed: Math.round(now - this.lastTrigger.time)
        })
        return true
      }
      return false
    }
  }
}
</script>

<style lang="less" scoped>
.sidebarTriggerContainer {
  position: fixed;
  right: -60px;
  top: 0;
  height: 100vh;
  transition: right 0.3s ease;
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: visible;
  pointer-events: none;

  &.isDark {
    .trigger {
      background-color: #262a2e;

      &:not(.suppressItemHover) .triggerItem:hover {
        background-color: hsla(0, 0%, 100%, 0.05);
      }

      &.suppressItemHover .triggerItem:hover {
        background-color: transparent;
      }

      .triggerItem {
        color: hsla(0, 0%, 100%, 0.6);
      }
    }
  }

  &.panelOpen:not(.sidebarOpen) {
    right: 0;
  }

  &.panelOpen.sidebarOpen {
    right: 300px;
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
    left: -18px;
    width: 18px;
    height: 52px;
    background: #409eff;
    top: 50%;
    transform: translateY(-50%);
    cursor: pointer;
    transition: background 0.15s ease, box-shadow 0.15s ease;
    z-index: 4;
    border-top-left-radius: 6px;
    border-bottom-left-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    box-shadow: 0 1px 6px rgba(64, 158, 255, 0.22);
    pointer-events: auto;

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
      pointer-events: none;
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
    pointer-events: auto;

    &:not(.suppressItemHover) .triggerItem:hover {
      background-color: #ededed;
    }

    &.suppressItemHover .triggerItem:hover {
      background-color: transparent;
    }

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

      &.active {
        color: #409eff;
        font-weight: bold;
      }

      .triggerIcon {
        font-size: 18px;
        margin-bottom: 5px;
        pointer-events: none;
      }

      .triggerName {
        font-size: 13px;
        pointer-events: none;
      }
    }
  }
}
</style>
