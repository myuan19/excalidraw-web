<template>
  <Sidebar ref="sidebar" :title="$t('style.title')" panelKey="nodeStyle">
    <div
      class="styleBox"
      :class="{ isDark: isDark }"
    >
      <NodePreviewStage
        :mindMap="mindMap"
        :isDark="isDark"
        :show="activeStyleNodes.length > 0"
        :node="getCurrentStyleTargetNode()"
      ></NodePreviewStage>
      <div
        class="sidebarContent customScrollbar"
        v-if="activeStyleNodes.length > 0"
      >
        <!-- 文字 -->
        <div class="title noTop">{{ $t('style.text') }}</div>
        <div class="row">
          <div class="rowItem">
            <!-- <span class="name">{{ $t('style.fontFamily') }}</span> -->
            <el-select
              size="mini"
              style="width: 100px"
              v-model="style.fontFamily"
              placeholder=""
              @change="update('fontFamily')"
            >
              <el-option
                v-for="item in fontFamilyList"
                :key="item.value"
                :label="item.name"
                :value="item.value"
                :style="{ fontFamily: item.value }"
              >
              </el-option>
            </el-select>
          </div>
          <div class="rowItem">
            <!-- <span class="name">{{ $t('style.fontSize') }}</span> -->
            <el-select
              size="mini"
              style="width: 60px"
              v-model="style.fontSize"
              placeholder=""
              @change="update('fontSize')"
            >
              <el-option
                v-for="item in fontSizeList"
                :key="item"
                :label="item"
                :value="item"
                :style="{ fontSize: item + 'px' }"
              >
              </el-option>
            </el-select>
          </div>
          <div class="rowItem">
            <el-select
              size="mini"
              style="width: 80px"
              v-model="style.textAlign"
              placeholder=""
              @change="update('textAlign')"
            >
              <el-option
                v-for="item in alignList"
                :key="item.value"
                :label="item.name"
                :value="item.value"
              >
              </el-option>
            </el-select>
          </div>
        </div>
        <div class="row">
          <div class="btnGroup">
            <el-tooltip :content="$t('style.color')" placement="bottom">
              <DelayedPopover placement="bottom">
                <div slot="reference" class="styleBtn">
                  A
                  <span
                    class="colorShow"
                    :style="{ backgroundColor: style.color || '#eee' }"
                  ></span>
                </div>
                <Color :color="style.color" @change="changeFontColor"></Color>
              </DelayedPopover>
            </el-tooltip>
            <el-tooltip :content="$t('style.addFontWeight')" placement="bottom">
              <div
                class="styleBtn"
                :class="{
                  actived: style.fontWeight === 'bold'
                }"
                @click="toggleFontWeight"
              >
                B
              </div>
            </el-tooltip>
            <el-tooltip :content="$t('style.italic')" placement="bottom">
              <div
                class="styleBtn i"
                :class="{
                  actived: style.fontStyle === 'italic'
                }"
                @click="toggleFontStyle"
              >
                I
              </div>
            </el-tooltip>
            <el-tooltip
              :content="$t('style.textDecoration')"
              placement="bottom"
            >
              <DelayedPopover placement="bottom">
                <div
                  slot="reference"
                  class="styleBtn u"
                  :style="{ textDecoration: style.textDecoration || 'none' }"
                >
                  U
                </div>
                <el-radio-group
                  size="mini"
                  v-model="style.textDecoration"
                  @change="update('textDecoration')"
                >
                  <el-radio-button label="none">{{
                    $t('style.none')
                  }}</el-radio-button>
                  <el-radio-button label="underline">{{
                    $t('style.underline')
                  }}</el-radio-button>
                  <el-radio-button label="line-through">{{
                    $t('style.lineThrough')
                  }}</el-radio-button>
                  <el-radio-button label="overline">{{
                    $t('style.overline')
                  }}</el-radio-button>
                </el-radio-group>
              </DelayedPopover>
            </el-tooltip>
          </div>
        </div>
        <!-- 边框 -->
        <div class="title">{{ $t('style.border') }}</div>
        <div class="row">
          <div class="rowItem">
            <span class="name">{{ $t('style.color') }}</span>
            <DelayedPopover placement="bottom">
              <span
                slot="reference"
                class="block"
                :style="{ width: '80px', backgroundColor: style.borderColor }"
              ></span>
              <Color
                :color="style.borderColor"
                @change="changeBorderColor"
              ></Color>
            </DelayedPopover>
          </div>
          <div class="rowItem">
            <span class="name">{{ $t('style.style') }}</span>
            <el-select
              size="mini"
              style="width: 80px"
              v-model="style.borderDasharray"
              placeholder=""
              @change="update('borderDasharray')"
            >
              <el-option
                v-for="item in borderDasharrayList"
                :key="item.value"
                :label="item.name"
                :value="item.value"
              >
                <svg width="120" height="34">
                  <line
                    x1="10"
                    y1="17"
                    x2="110"
                    y2="17"
                    stroke-width="2"
                    :stroke="
                      style.borderDasharray === item.value
                        ? '#409eff'
                        : isDark
                        ? '#fff'
                        : '#000'
                    "
                    :stroke-dasharray="item.value"
                  ></line>
                </svg>
              </el-option>
            </el-select>
          </div>
        </div>
        <div class="row">
          <div class="rowItem">
            <span class="name">{{ $t('style.width') }}</span>
            <el-select
              size="mini"
              style="width: 80px"
              v-model="style.borderWidth"
              placeholder=""
              @change="update('borderWidth')"
            >
              <el-option
                v-for="item in borderWidthList"
                :key="item"
                :label="item"
                :value="item"
              >
                <span
                  v-if="item > 0"
                  class="borderLine"
                  :class="{ isDark: isDark }"
                  :style="{ height: item + 'px' }"
                ></span>
              </el-option>
            </el-select>
          </div>
          <div class="rowItem" v-show="style.shape === 'rectangle'">
            <span class="name">{{ $t('style.borderRadius') }}</span>
            <el-select
              size="mini"
              style="width: 80px"
              v-model="style.borderRadius"
              placeholder=""
              @change="update('borderRadius')"
            >
              <el-option
                v-for="item in borderRadiusList"
                :key="item"
                :label="item"
                :value="item"
              >
              </el-option>
            </el-select>
          </div>
        </div>
        <!-- 背景 -->
        <div class="title">{{ $t('style.background') }}</div>
        <div class="row">
          <div class="rowItem">
            <span class="name">{{ $t('style.color') }}</span>
            <DelayedPopover placement="bottom">
              <span
                slot="reference"
                class="block"
                :style="{ backgroundColor: style.fillColor }"
              ></span>
              <Color :color="style.fillColor" @change="changeFillColor"></Color>
            </DelayedPopover>
            <span class="name" style="margin-left: 20px;">{{
              $t('style.gradientStyle')
            }}</span>
            <el-checkbox
              v-model="style.gradientStyle"
              @change="update('gradientStyle')"
            ></el-checkbox>
          </div>
        </div>
        <div class="row" v-if="style.gradientStyle">
          <div class="rowItem">
            <span class="name">{{ $t('style.startColor') }}</span>
            <DelayedPopover placement="bottom">
              <span
                slot="reference"
                class="block"
                :style="{ backgroundColor: style.startColor }"
              ></span>
              <Color
                :color="style.startColor"
                @change="changeStartColor"
              ></Color>
            </DelayedPopover>
          </div>
          <div class="rowItem">
            <span class="name">{{ $t('style.endColor') }}</span>
            <DelayedPopover placement="bottom">
              <span
                slot="reference"
                class="block"
                :style="{ backgroundColor: style.endColor }"
              ></span>
              <Color :color="style.endColor" @change="changeEndColor"></Color>
            </DelayedPopover>
          </div>
          <div class="rowItem">
            <span class="name">{{ $t('style.direction') }}</span>
            <el-select
              size="mini"
              style="width: 80px"
              v-model="style.linearGradientDir"
              placeholder=""
              @change="update('linearGradientDir')"
            >
              <el-option
                v-for="item in linearGradientDirList"
                :key="item.value"
                :label="item.name"
                :value="item.value"
              >
              </el-option>
            </el-select>
          </div>
        </div>
        <!-- 形状 -->
        <div class="title">{{ $t('style.shape') }}</div>
        <div class="row">
          <div class="rowItem">
            <span class="name">{{ $t('style.shape') }}</span>
            <el-select
              size="mini"
              style="width: 120px"
              v-model="style.shape"
              placeholder=""
              @change="update('shape')"
            >
              <el-option
                v-for="item in shapeList"
                :key="item.value"
                :label="item.name"
                :value="item.value"
                style="display: flex; justify-content: center; align-items: center;"
              >
                <svg
                  :width="item.width || 60"
                  :height="item.height || 26"
                  style="margin-top: 5px"
                >
                  <path
                    :d="shapeListMap[item.value]"
                    fill="none"
                    :stroke="
                      style.shape === item.value
                        ? '#409eff'
                        : isDark
                        ? '#fff'
                        : '#000'
                    "
                    stroke-width="2"
                  ></path>
                </svg>
              </el-option>
            </el-select>
          </div>
        </div>
        <!-- 线条 -->
        <div class="title">{{ $t('style.line') }}</div>
        <div class="row">
          <div class="rowItem">
            <span class="name">{{ $t('style.color') }}</span>
            <DelayedPopover placement="bottom">
              <span
                slot="reference"
                class="block"
                :style="{ width: '80px', backgroundColor: style.lineColor }"
              ></span>
              <Color :color="style.lineColor" @change="changeLineColor"></Color>
            </DelayedPopover>
          </div>
          <div class="rowItem">
            <span class="name">{{ $t('style.style') }}</span>
            <el-select
              size="mini"
              style="width: 80px"
              v-model="style.lineDasharray"
              placeholder=""
              @change="update('lineDasharray')"
            >
              <el-option
                v-for="item in borderDasharrayList"
                :key="item.value"
                :label="item.name"
                :value="item.value"
              >
                <svg width="120" height="34">
                  <line
                    x1="10"
                    y1="17"
                    x2="110"
                    y2="17"
                    stroke-width="2"
                    :stroke="
                      style.lineDasharray === item.value
                        ? '#409eff'
                        : isDark
                        ? '#fff'
                        : '#000'
                    "
                    :stroke-dasharray="item.value"
                  ></line>
                </svg>
              </el-option>
            </el-select>
          </div>
        </div>
        <div class="row">
          <div class="rowItem">
            <span class="name">{{ $t('style.width') }}</span>
            <el-select
              size="mini"
              style="width: 80px"
              v-model="style.lineWidth"
              placeholder=""
              @change="update('lineWidth')"
            >
              <el-option
                v-for="item in borderWidthList"
                :key="item"
                :label="item"
                :value="item"
              >
                <span
                  v-if="item > 0"
                  class="borderLine"
                  :class="{ isDark: isDark }"
                  :style="{ height: item + 'px' }"
                ></span>
              </el-option>
            </el-select>
          </div>
          <div class="rowItem">
            <span class="name">{{ $t('style.arrowDir') }}</span>
            <el-select
              size="mini"
              style="width: 80px"
              v-model="style.lineMarkerDir"
              placeholder=""
              @change="update('lineMarkerDir')"
            >
              <el-option
                key="start"
                :label="$t('style.arrowDirStart')"
                value="start"
              ></el-option>
              <el-option
                key="end"
                :label="$t('style.arrowDirEnd')"
                value="end"
              ></el-option>
            </el-select>
          </div>
        </div>
        <!-- 节点内边距 -->
        <div class="title">{{ $t('style.nodePadding') }}</div>
        <div class="row noBottom">
          <div class="rowItem">
            <span class="name">{{ $t('style.horizontal') }}</span>
            <ThemeSlider
              :mindMap="mindMap"
              width="200px"
              v-model="style.paddingX"
              @input="previewNodeStyle('paddingX')"
              @change="update('paddingX')"
            ></ThemeSlider>
          </div>
        </div>
        <div class="row">
          <div class="rowItem">
            <span class="name">{{ $t('style.vertical') }}</span>
            <ThemeSlider
              :mindMap="mindMap"
              width="200px"
              v-model="style.paddingY"
              @input="previewNodeStyle('paddingY')"
              @change="update('paddingY')"
            ></ThemeSlider>
          </div>
        </div>
        <!-- 节点图片布局 -->
        <div class="title">{{ $t('style.img') }}</div>
        <div class="row">
          <div class="rowItem">
            <span class="name">{{ $t('style.placement') }}</span>
            <el-radio-group
              v-model="style.imgPlacement"
              size="mini"
              @change="update('imgPlacement')"
            >
              <el-radio-button label="top">{{
                $t('style.top')
              }}</el-radio-button>
              <el-radio-button label="bottom">{{
                $t('style.bottom')
              }}</el-radio-button>
              <el-radio-button label="left">{{
                $t('style.left')
              }}</el-radio-button>
              <el-radio-button label="right">{{
                $t('style.right')
              }}</el-radio-button>
            </el-radio-group>
          </div>
        </div>
        <!-- 节点标签布局 -->
        <div class="title">{{ $t('style.tag') }}</div>
        <div class="row">
          <div class="rowItem">
            <span class="name">{{ $t('style.placement') }}</span>
            <el-radio-group
              v-model="style.tagPlacement"
              size="mini"
              @change="update('tagPlacement')"
            >
              <el-radio-button label="right">{{
                $t('style.right')
              }}</el-radio-button>
              <el-radio-button label="bottom">{{
                $t('style.bottom')
              }}</el-radio-button>
            </el-radio-group>
          </div>
        </div>
      </div>
      <div class="tipBox" v-else>
        <div class="tipIcon iconfont icontianjiazijiedian"></div>
        <div class="tipText">{{ $t('style.selectNodeTip') }}</div>
      </div>
    </div>
  </Sidebar>
</template>

<script>
import Sidebar from './Sidebar.vue'
import Color from './Color.vue'
import {
  fontFamilyList,
  fontSizeList,
  borderWidthList,
  borderDasharrayList,
  borderRadiusList,
  shapeList,
  shapeListMap,
  linearGradientDirList,
  alignList
} from '@/config'
import { mapState } from 'vuex'
import sidebarPanelDebug from '@/mixins/sidebarPanelDebug'
import sidebarHistorySync from '@/mixins/sidebarHistorySync'
import { sidebarDebug } from '@/utils/sidebarDebug'
import ThemeSlider from '@/components/ThemeSlider.vue'
import NodePreviewStage from '@/components/sidebar/NodePreviewStage.vue'
import {
  commitNodeStylesOnNodes,
  commitNodeStyleOnNodes,
  previewNodeStyleOnNodes
} from '@/utils/editHistory'

// 节点样式设置
export default {
  name: 'Style',
  mixins: [sidebarPanelDebug, sidebarHistorySync],
  components: {
    Sidebar,
    Color,
    ThemeSlider,
    NodePreviewStage,
    DelayedPopover: () => import('@/components/DelayedPopover.vue')
  },
  props: {
    mindMap: {
      type: Object
    }
  },
  data() {
    return {
      fontSizeList,
      borderWidthList,
      borderRadiusList,
      activeNodes: [],
      style: {
        shape: '',
        paddingX: 0,
        paddingY: 0,
        color: '',
        fontFamily: '',
        fontSize: '',
        textDecoration: '',
        fontWeight: '',
        fontStyle: '',
        borderWidth: '',
        borderColor: '',
        fillColor: '',
        borderDasharray: '',
        borderRadius: '',
        lineColor: '',
        lineDasharray: '',
        lineWidth: '',
        lineMarkerDir: '',
        gradientStyle: false,
        startColor: '',
        endColor: '',
        linearGradientDir: '',
        lineFlow: false,
        lineFlowForward: true,
        lineFlowDuration: 1,
        textAlign: '',
        imgPlacement: '',
        tagPlacement: ''
      }
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
    borderDasharrayList() {
      return borderDasharrayList[this.$i18n.locale] || borderDasharrayList.zh
    },
    shapeList() {
      return [
        ...(shapeList[this.$i18n.locale] || shapeList.zh),
        ...this.mindMap.extendShapeList
          .filter(item => {
            return !['fishHead'].includes(item.name)
          })
          .map(item => {
            return {
              width: '40px',
              name: item.nameShow,
              value: item.name
            }
          })
      ]
    },
    shapeListMap() {
      const map2 = {}
      this.mindMap.extendShapeList.forEach(item => {
        map2[item.name] = item.path
      })
      return {
        ...shapeListMap,
        ...map2
      }
    },
    linearGradientDirList() {
      return (
        linearGradientDirList[this.$i18n.locale] || linearGradientDirList.zh
      )
    },
    alignList() {
      return alignList[this.$i18n.locale] || alignList.zh
    },
    activeStyleNodes() {
      return this.getStyleTargetNodes(this.activeNodes)
    }
  },
  watch: {
    activeSidebar(val, oldVal) {
      this.logSidebarPanelWatch('nodeStyle', val, oldVal)
      this.$nextTick(() => {
        if (!this.$refs.sidebar) {
          this.logSidebarPanelWatch('nodeStyle', val, oldVal, { branch: 'missing-ref' })
          return
        }
        if (val === 'nodeStyle') {
          this.$refs.sidebar.show = true
          this.logSidebarPanelWatch('nodeStyle', val, oldVal, { branch: 'show-true' })
        } else if (this.$refs.sidebar.show) {
          this.$refs.sidebar.show = false
          this.logSidebarPanelWatch('nodeStyle', val, oldVal, { branch: 'show-false' })
        }
      })
    }
  },
  mounted() {
    const mountStartedAt = performance.now()
    this.logSidebarPanelMounted('nodeStyle')
    sidebarDebug('Style mounted start', {
      activeSidebar: this.activeSidebar || null
    })
    this.$nextTick(() => {
      try {
        if (this.activeSidebar === 'nodeStyle' && this.$refs.sidebar) {
          this.$refs.sidebar.show = true
        }
        this.activeNodes = this.mindMap.renderer
          ? [...(this.mindMap.renderer.activeNodeList || [])]
          : []
        this.initNodeStyle()
        sidebarDebug('Style mounted done', {
          activeSidebar: this.activeSidebar || null,
          activeNodes: this.activeNodes.length,
          ms: Math.round(performance.now() - mountStartedAt)
        })
      } catch (error) {
        sidebarDebug('Style mounted error', {
          message: error && error.message,
          stack: error && error.stack
        })
        throw error
      }
    })
  },
  created() {
    this.logSidebarPanelCreated('nodeStyle')
    this.$bus.$on('node_active', this.onNodeActive)
  },
  beforeDestroy() {
    this.$bus.$off('node_active', this.onNodeActive)
  },
  methods: {
    syncFromEditHistory() {
      if (!this.mindMap) return
      this.activeNodes = this.mindMap.renderer
        ? [...(this.mindMap.renderer.activeNodeList || [])]
        : []
      this.initNodeStyle()
    },

    getStyleTargetNodes(nodes = []) {
      return (nodes || []).filter(node => {
        return node && !node.isRoot && !node.isGeneralization
      })
    },

    getCurrentStyleTargetNode() {
      return this.activeStyleNodes.length > 0 ? this.activeStyleNodes[0] : null
    },

    // 监听节点激活事件
    onNodeActive(...args) {
      const startedAt = performance.now()
      sidebarDebug('Style onNodeActive', {
        argCount: args.length,
        nodeCount: Array.isArray(args[1]) ? args[1].length : 0
      })
      this.$nextTick(() => {
        try {
          this.activeNodes = Array.isArray(args[1]) ? [...args[1]] : []
          this.initNodeStyle()
          sidebarDebug('Style onNodeActive done', {
            activeNodes: this.activeNodes.length,
            ms: Math.round(performance.now() - startedAt)
          })
        } catch (error) {
          sidebarDebug('Style onNodeActive error', {
            message: error && error.message,
            stack: error && error.stack
          })
          throw error
        }
      })
    },

    // 初始节点样式
    initNodeStyle() {
      const node = this.getCurrentStyleTargetNode()
      if (!node) {
        return
      }
      Object.keys(this.style).forEach(item => {
        this.style[item] = node.getStyle(item, false)
      })
      this.initLinearGradientDir()
    },

    // 初始化渐变方向样式
    initLinearGradientDir() {
      const node = this.getCurrentStyleTargetNode()
      if (!node) {
        return
      }
      const startDir = node.getStyle('startDir', false)
      const endDir = node.getStyle('endDir', false)
      const target = this.linearGradientDirList.find(item => {
        return (
          item.start[0] === startDir[0] &&
          item.start[1] === startDir[1] &&
          item.end[0] === endDir[0] &&
          item.end[1] === endDir[1]
        )
      })
      if (target) {
        this.style.linearGradientDir = target.value
      }
    },

    previewNodeStyle(prop) {
      previewNodeStyleOnNodes(
        this.activeStyleNodes,
        prop,
        this.style[prop]
      )
    },

    // 修改样式（松手或选择后提交一条历史）
    update(prop) {
      if (prop === 'linearGradientDir') {
        const target = this.linearGradientDirList.find(item => {
          return item.value === this.style.linearGradientDir
        })
        commitNodeStylesOnNodes(this.activeStyleNodes, {
          startDir: [...target.start],
          endDir: [...target.end]
        })
      } else {
        commitNodeStyleOnNodes(
          this.activeStyleNodes,
          prop,
          this.style[prop]
        )
      }
    },

    // 切换加粗样式
    toggleFontWeight() {
      if (this.style.fontWeight === 'bold') {
        this.style.fontWeight = 'normal'
      } else {
        this.style.fontWeight = 'bold'
      }
      this.update('fontWeight')
    },

    // 切换字体样式
    toggleFontStyle() {
      if (this.style.fontStyle === 'italic') {
        this.style.fontStyle = 'normal'
      } else {
        this.style.fontStyle = 'italic'
      }
      this.update('fontStyle')
    },

    // 修改字体颜色
    changeFontColor(color) {
      this.style.color = color
      this.update('color')
    },

    // 修改边框颜色
    changeBorderColor(color) {
      this.style.borderColor = color
      this.update('borderColor')
    },

    // 修改线条颜色
    changeLineColor(color) {
      this.style.lineColor = color
      this.update('lineColor')
    },

    // 修改背景颜色
    changeFillColor(color) {
      this.style.fillColor = color
      this.update('fillColor')
    },

    // 切换渐变开始颜色
    changeStartColor(color) {
      this.style.startColor = color
      this.update('startColor')
    },

    // 切换渐变结束颜色
    changeEndColor(color) {
      this.style.endColor = color
      this.update('endColor')
    }
  }
}
</script>

<style lang="less" scoped>
.styleBox {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;

  &.isDark {
    .sidebarContent {
      .title {
        color: #fff;
      }

      .row {
        .rowItem {
          .name {
            color: hsla(0, 0%, 100%, 0.6);
          }
        }

        .styleBtn {
          background-color: #363b3f;
          color: hsla(0, 0%, 100%, 0.6);
          border-color: hsla(0, 0%, 100%, 0.1);
        }
      }
    }
  }

  .tab {
    flex-grow: 0;
    flex-shrink: 0;
    width: 100%;
  }
}

@import '@/styles/nodePreview.less';

.tipBox {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  color: #666;
  padding: 24px 20px 8px;
  box-sizing: border-box;

  .tipIcon {
    font-size: 52px;
  }

  .tipText {
    margin-top: 6px;
    font-size: 13px;
  }
}

.sidebarContent {
  padding: 20px;
  padding-top: 10px;

  .title {
    font-size: 16px;
    font-family: PingFangSC-Medium, PingFang SC;
    font-weight: 500;
    color: rgba(26, 26, 26, 0.9);
    margin-bottom: 10px;
    margin-top: 35px;

    &.noTop {
      margin-top: 0;
    }
  }

  .row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 10px;

    &.noBottom {
      margin-bottom: 0;
    }

    .btnGroup {
      width: 100%;
      display: flex;
      justify-content: space-between;
    }

    .rowItem {
      display: flex;
      align-items: center;

      .name {
        font-size: 12px;
        margin-right: 10px;
      }

      .block {
        display: inline-block;
        width: 30px;
        height: 30px;
        border: 1px solid #dcdfe6;
        border-radius: 4px;
        cursor: pointer;

        &.disabled {
          background-color: #f5f7fa !important;
          border-color: #e4e7ed !important;
          color: #c0c4cc !important;
          cursor: not-allowed !important;
        }
      }
    }

    .styleBtn {
      position: relative;
      width: 50px;
      height: 30px;
      background: #fff;
      border: 1px solid #eee;
      display: flex;
      justify-content: center;
      align-items: center;
      font-weight: bold;
      cursor: pointer;
      border-radius: 4px;

      &.actived {
        background-color: #eee;
      }

      &.disabled {
        background-color: #f5f7fa !important;
        border-color: #e4e7ed !important;
        color: #c0c4cc !important;
        cursor: not-allowed !important;
      }

      &.i {
        font-style: italic;
      }

      &.u {
      }

      .colorShow {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 2px;
      }
    }
  }
}

.borderLine {
  display: inline-block;
  width: 100%;
  background-color: #000;

  &.isDark {
    background-color: #fff;
  }
}
</style>
<style lang="less">
.el-select-dropdown__item.selected {
  .borderLine {
    background-color: #409eff;
  }
}
</style>
