<template>
  <Sidebar ref="sidebar" :title="$t('outline.title')" panelKey="outline">
    <div class="outlineSidebarBody">
      <div class="btnList">
        <el-tooltip
          class="item"
          effect="dark"
          :content="$t('outline.expandAll')"
          placement="top"
        >
          <div class="btn" :class="{ isDark: isDark }" @click="onExpandAll">
            <span class="icon iconfont iconzhankai"></span>
          </div>
        </el-tooltip>
        <el-tooltip
          class="item"
          effect="dark"
          :content="$t('outline.collapseAll')"
          placement="top"
        >
          <div class="btn" :class="{ isDark: isDark }" @click="onCollapseAll">
            <span class="icon iconfont iconzhankai1"></span>
          </div>
        </el-tooltip>
        <el-tooltip
          class="item"
          effect="dark"
          :content="$t('outline.print')"
          placement="top"
        >
          <div class="btn" :class="{ isDark: isDark }" @click="onPrint">
            <span class="icon iconfont iconprinting"></span>
          </div>
        </el-tooltip>
        <el-tooltip
          class="item"
          effect="dark"
          :content="$t('outline.fullscreen')"
          placement="top"
        >
          <div
            class="btn"
            :class="{ isDark: isDark }"
            @click="onChangeToOutlineEdit"
          >
            <span class="icon iconfont iconquanping1"></span>
          </div>
        </el-tooltip>
      </div>
      <Outline
        class="outlineTreePanel"
        :mindMap="mindMap"
        :panelActive="activeSidebar === 'outline' && !isOutlineEdit"
        @scrollTo="onScrollTo"
        ref="outlineRef"
      ></Outline>
    </div>
  </Sidebar>
</template>

<script>
import Sidebar from './Sidebar.vue'
import { mapState, mapMutations } from 'vuex'
import Outline from './Outline.vue'
import { printOutline } from '@/utils'
import sidebarPanelDebug from '@/mixins/sidebarPanelDebug'
import { editHistoryDebug } from '@/utils/editHistoryDebug'

// 大纲侧边栏
export default {
  name: 'OutlineSidebar',
  mixins: [sidebarPanelDebug],
  components: {
    Sidebar,
    Outline
  },
  props: {
    mindMap: {
      type: Object
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark,
      activeSidebar: state => state.activeSidebar,
      isOutlineEdit: state => state.isOutlineEdit
    })
  },
  watch: {
    activeSidebar(val, oldVal) {
      this.logSidebarPanelWatch('outline', val, oldVal)
      if (val === 'outline' && !this.isOutlineEdit) {
        this.$refs.sidebar.show = true
        this.logSidebarPanelWatch('outline', val, oldVal, { branch: 'show-true' })
      } else {
        this.$refs.sidebar.show = false
        this.logSidebarPanelWatch('outline', val, oldVal, { branch: 'show-false' })
      }
    },
    isOutlineEdit(val, oldVal) {
      if (val) {
        if (this.$refs.sidebar) {
          this.$refs.sidebar.show = false
        }
      } else if (oldVal && this.activeSidebar === 'outline' && this.$refs.sidebar) {
        this.$refs.sidebar.show = true
      }
    }
  },
  created() {
    this.logSidebarPanelCreated('outline')
  },
  mounted() {
    this.logSidebarPanelMounted('outline')
    if (this.activeSidebar === 'outline' && this.$refs.sidebar) {
      this.$refs.sidebar.show = true
    }
  },
  methods: {
    ...mapMutations(['setIsOutlineEdit']),

    onChangeToOutlineEdit() {
      this.setIsOutlineEdit(true)
    },

    onScrollTo(y) {
      const outline = this.$refs.outlineRef
      let container =
        (outline && outline.getScrollContainer()) || this.$refs.sidebar.getEl()
      let height = container.offsetHeight
      let top = container.scrollTop
      if (y > top + height) {
        container.scrollTo(0, y - height / 2)
      }
    },

    onExpandAll() {
      this.$refs.outlineRef && this.$refs.outlineRef.expandAllNodes()
    },

    onCollapseAll() {
      this.$refs.outlineRef && this.$refs.outlineRef.collapseAllNodes()
    },

    restoreOutlineScroll(outline, scrollTop) {
      const scrollEl = outline && outline.getScrollContainer()
      if (!scrollEl) {
        return
      }
      scrollEl.scrollTop = scrollTop
      editHistoryDebug('outline scroll restored', {
        scrollTop,
        containerClass: scrollEl.className
      })
    },

    async onPrint() {
      const outline = this.$refs.outlineRef
      const outlineEl = outline && outline.$el
      if (!outlineEl) {
        return
      }
      const scrollTop = outline.getScrollContainer()
        ? outline.getScrollContainer().scrollTop
        : 0
      editHistoryDebug('outline print start', { scrollTop })
      if (outline.setPrinting) {
        outline.setPrinting(true)
      }
      try {
        await printOutline(outlineEl)
      } finally {
        if (outline.setPrinting) {
          outline.setPrinting(false)
        }
        const restore = () => this.restoreOutlineScroll(outline, scrollTop)
        restore()
        this.$nextTick(restore)
        setTimeout(restore, 50)
        setTimeout(restore, 200)
      }
    }
  }
}
</script>

<style lang="less" scoped>
.outlineSidebarBody {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.outlineTreePanel {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.btnList {
  position: absolute;
  right: 46px;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  height: 44px;

  .btn {
    cursor: pointer;
    margin-left: 10px;
    line-height: 1;

    &.isDark {
      color: #fff;
    }
  }
}
</style>
