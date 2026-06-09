<template>
  <Sidebar ref="sidebar" :title="$t('baseStyle.title')" panelKey="baseStyle">
    <div
      class="sidebarContent customScrollbar"
      :class="{ isDark: isDark }"
      v-if="data"
    >
      <el-tabs v-model="sectionTab" class="baseStyleSectionTabs">
        <el-tab-pane
          :label="$t('baseStyle.sectionCanvas')"
          name="canvas"
        >
      <div class="title noTop">{{ $t('baseStyle.background') }}</div>
      <div class="row">
        <el-tabs class="tab" v-model="activeTab">
          <el-tab-pane :label="$t('baseStyle.color')" name="color">
            <Color
              :color="style.backgroundColor"
              @change="
                color => {
                  update('backgroundColor', color)
                }
              "
            ></Color>
          </el-tab-pane>
          <el-tab-pane :label="$t('baseStyle.image')" name="image">
            <ImgUpload
              class="imgUpload"
              v-model="style.backgroundImage"
              @change="
                img => {
                  update('backgroundImage', img)
                }
              "
            ></ImgUpload>
            <!-- 图片重复方式 -->
            <div class="rowItem">
              <span class="name">{{ $t('baseStyle.imageRepeat') }}</span>
              <el-select
                size="mini"
                style="width: 120px"
                v-model="style.backgroundRepeat"
                placeholder=""
                @change="
                  value => {
                    update('backgroundRepeat', value)
                  }
                "
              >
                <el-option
                  v-for="item in backgroundRepeatList"
                  :key="item.value"
                  :label="item.name"
                  :value="item.value"
                >
                </el-option>
              </el-select>
            </div>
            <!-- 图片位置 -->
            <div class="rowItem">
              <span class="name">{{ $t('baseStyle.imagePosition') }}</span>
              <el-select
                size="mini"
                style="width: 120px"
                v-model="style.backgroundPosition"
                placeholder=""
                @change="
                  value => {
                    update('backgroundPosition', value)
                  }
                "
              >
                <el-option
                  v-for="item in backgroundPositionList"
                  :key="item.value"
                  :label="item.name"
                  :value="item.value"
                >
                </el-option>
              </el-select>
            </div>
            <!-- 图片大小 -->
            <div class="rowItem">
              <span class="name">{{ $t('baseStyle.imageSize') }}</span>
              <el-select
                size="mini"
                style="width: 120px"
                v-model="style.backgroundSize"
                placeholder=""
                @change="
                  value => {
                    update('backgroundSize', value)
                  }
                "
              >
                <el-option
                  v-for="item in backgroundSizeList"
                  :key="item.value"
                  :label="item.name"
                  :value="item.value"
                >
                </el-option>
              </el-select>
            </div>
            <!-- 内置背景图片 -->
            <div
              class="rowItem spaceBetween"
              style="margin-top: 8px; margin-bottom: 8px;"
              v-if="bgList.length > 0"
            >
              <div class="name">{{ $t('baseStyle.builtInBackgroundImage') }}</div>
              <div
                class="iconBtn el-icon-arrow-down"
                :class="{ top: !bgListExpand }"
                @click="bgListExpand = !bgListExpand"
              ></div>
            </div>
            <div class="bgList" :class="{ expand: bgListExpand }">
              <div
                class="bgItem"
                v-for="(item, index) in bgList"
                :key="index"
                :class="{active: style.backgroundImage === item}"
                @click="useBg(item)"
              >
                <img :src="item" alt="" />
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
        </el-tab-pane>
        <el-tab-pane :label="$t('baseStyle.sectionLine')" name="line">
      <div class="title noTop">{{ $t('baseStyle.line') }}</div>
      <div class="row">
        <div class="rowItem">
          <span class="name">{{ $t('baseStyle.color') }}</span>
          <DelayedPopover placement="bottom">
            <span
              slot="reference"
              class="block"
              :style="{ backgroundColor: style.lineColor }"
            ></span>
            <Color
              :color="style.lineColor"
              @change="
                color => {
                  update('lineColor', color)
                }
              "
            ></Color>
          </DelayedPopover>
        </div>
        <div class="rowItem">
          <span class="name">{{ $t('baseStyle.width') }}</span>
          <el-select
            size="mini"
            style="width: 80px"
            v-model="style.lineWidth"
            placeholder=""
            @change="
              value => {
                update('lineWidth', value)
              }
            "
          >
            <el-option
              v-for="item in lineWidthList"
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
      </div>
      <div class="row">
        <!-- 线宽 -->
        <div class="rowItem" v-if="lineStyleListShow.length > 1">
          <span class="name">{{ $t('baseStyle.style') }}</span>
          <el-select
            size="mini"
            style="width: 80px"
            v-model="style.lineStyle"
            placeholder=""
            @change="
              value => {
                update('lineStyle', value)
              }
            "
          >
            <el-option
              v-for="item in lineStyleListShow"
              :key="item.value"
              :label="item.name"
              :value="item.value"
              class="lineStyleOption"
              :class="{
                isDark: isDark,
                isSelected: style.lineStyle === item.value
              }"
              v-html="lineStyleMap[item.value]"
            >
            </el-option>
          </el-select>
        </div>
        <!-- 根节点连线样式 -->
        <div
          class="rowItem"
          v-if="
            style.lineStyle === 'curve' && showRootLineKeepSameInCurveLayouts
          "
        >
          <span class="name">{{ $t('baseStyle.rootStyle') }}</span>
          <el-select
            size="mini"
            style="width: 80px"
            v-model="style.rootLineKeepSameInCurve"
            placeholder=""
            @change="
              value => {
                update('rootLineKeepSameInCurve', value)
              }
            "
          >
            <el-option
              v-for="item in rootLineKeepSameInCurveList"
              :key="item.value"
              :label="item.name"
              :value="item.value"
            >
            </el-option>
          </el-select>
        </div>
        <div class="rowItem" v-if="showLineRadius">
          <!-- 连线圆角大小 -->
          <span class="name">{{ $t('baseStyle.lineRadius') }}</span>
          <el-select
            size="mini"
            style="width: 80px"
            v-model="style.lineRadius"
            placeholder=""
            @change="
              value => {
                update('lineRadius', value)
              }
            "
          >
            <el-option
              v-for="item in [0, 2, 5, 7, 10, 12, 15]"
              :key="item"
              :label="item"
              :value="item"
            >
            </el-option>
          </el-select>
        </div>
      </div>
      <div class="row">
        <!-- 根节点连线起始位置 -->
        <div
          class="rowItem"
          v-if="
            style.lineStyle === 'curve' && showRootLineKeepSameInCurveLayouts
          "
        >
          <span class="name">{{ $t('baseStyle.rootLineStartPos') }}</span>
          <el-select
            size="mini"
            style="width: 80px"
            v-model="style.rootLineStartPositionKeepSameInCurve"
            placeholder=""
            @change="
              value => {
                update('rootLineStartPositionKeepSameInCurve', value)
              }
            "
          >
            <el-option
              key="center"
              :label="$t('baseStyle.center')"
              :value="false"
            >
            </el-option>
            <el-option key="right" :label="$t('baseStyle.edge')" :value="true">
            </el-option>
          </el-select>
        </div>
      </div>
      <div class="row">
        <div class="rowItem">
          <el-checkbox
            v-model="style.showLineMarker"
            @change="
              value => {
                update('showLineMarker', value)
              }
            "
            >{{ $t('baseStyle.showArrow') }}</el-checkbox
          >
        </div>
      </div>
      <!-- 彩虹线条 -->
      <div class="title">{{ $t('baseStyle.rainbowLines') }}</div>
      <div class="row">
        <div class="rowItem">
          <DelayedPopover placement="right">
            <div class="rainbowLinesOptionsBox" :class="{ isDark: isDark }">
              <div
                class="optionItem"
                v-for="item in rainbowLinesOptions"
                :key="item.value"
              >
                <div
                  class="colorsBar"
                  v-if="item.list"
                  @click="updateRainbowLinesConfig(item)"
                >
                  <span
                    class="colorItem"
                    v-for="color in item.list"
                    :style="{ backgroundColor: color }"
                  ></span>
                </div>
                <span v-else @click="updateRainbowLinesConfig(item)">{{
                  $t('baseStyle.notUseRainbowLines')
                }}</span>
              </div>
            </div>
            <div slot="reference" class="curRainbowLine">
              <div class="colorsBar" v-if="curRainbowLineColorList">
                <span
                  class="colorItem"
                  v-for="color in curRainbowLineColorList"
                  :style="{ backgroundColor: color }"
                ></span>
              </div>
              <span v-else>{{ $t('baseStyle.notUseRainbowLines') }}</span>
            </div>
          </DelayedPopover>
        </div>
      </div>
      <!-- 概要连线 -->
      <div class="title">{{ $t('baseStyle.lineOfOutline') }}</div>
      <div class="row">
        <div class="rowItem">
          <span class="name">{{ $t('baseStyle.color') }}</span>
          <DelayedPopover placement="bottom">
            <span
              slot="reference"
              class="block"
              :style="{ backgroundColor: style.generalizationLineColor }"
            ></span>
            <Color
              :color="style.generalizationLineColor"
              @change="
                color => {
                  update('generalizationLineColor', color)
                }
              "
            ></Color>
          </DelayedPopover>
        </div>
        <div class="rowItem">
          <span class="name">{{ $t('baseStyle.width') }}</span>
          <el-select
            size="mini"
            style="width: 80px"
            v-model="style.generalizationLineWidth"
            placeholder=""
            @change="
              value => {
                update('generalizationLineWidth', value)
              }
            "
          >
            <el-option
              v-for="item in lineWidthList"
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
      </div>
        </el-tab-pane>
        <el-tab-pane
          :label="$t('baseStyle.sectionAssociative')"
          name="associative"
        >
      <div class="title noTop">{{ $t('baseStyle.associativeLine') }}</div>
      <div class="row">
        <div class="rowItem">
          <span class="name">{{ $t('baseStyle.associativeLineColor') }}</span>
          <DelayedPopover placement="bottom">
            <span
              slot="reference"
              class="block"
              :style="{ backgroundColor: style.associativeLineColor }"
            ></span>
            <Color
              :color="style.associativeLineColor"
              @change="
                color => {
                  update('associativeLineColor', color)
                }
              "
            ></Color>
          </DelayedPopover>
        </div>
        <div class="rowItem">
          <span class="name">{{ $t('baseStyle.associativeLineWidth') }}</span>
          <el-select
            size="mini"
            style="width: 80px"
            v-model="style.associativeLineWidth"
            placeholder=""
            @change="
              value => {
                update('associativeLineWidth', value)
              }
            "
          >
            <el-option
              v-for="item in lineWidthList"
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
      </div>
      <div class="row">
        <div class="rowItem">
          <span class="name">{{
            $t('baseStyle.associativeLineActiveColor')
          }}</span>
          <DelayedPopover placement="bottom">
            <span
              slot="reference"
              class="block"
              :style="{ backgroundColor: style.associativeLineActiveColor }"
            ></span>
            <Color
              :color="style.associativeLineActiveColor"
              @change="
                color => {
                  update('associativeLineActiveColor', color)
                }
              "
            ></Color>
          </DelayedPopover>
        </div>
        <div class="rowItem">
          <span class="name">{{
            $t('baseStyle.associativeLineActiveWidth')
          }}</span>
          <el-select
            size="mini"
            style="width: 80px"
            v-model="style.associativeLineActiveWidth"
            placeholder=""
            @change="
              value => {
                update('associativeLineActiveWidth', value)
              }
            "
          >
            <el-option
              v-for="item in lineWidthList"
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
      </div>
      <div class="row">
        <div class="rowItem">
          <span class="name">{{ $t('style.style') }}</span>
          <el-select
            size="mini"
            style="width: 80px"
            v-model="style.associativeLineDasharray"
            placeholder=""
            @change="
              value => {
                update('associativeLineDasharray', value)
              }
            "
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
                    style.associativeLineDasharray === item.value
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
      <!-- 关联线文字 -->
      <div class="title">{{ $t('baseStyle.associativeLineText') }}</div>
      <div class="row">
        <div class="rowItem">
          <span class="name">{{ $t('baseStyle.fontFamily') }}</span>
          <el-select
            size="mini"
            v-model="style.associativeLineTextFontFamily"
            placeholder=""
            @change="update('associativeLineTextFontFamily', $event)"
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
      </div>
      <div class="row">
        <div class="rowItem">
          <span class="name">{{ $t('baseStyle.color') }}</span>
          <DelayedPopover placement="bottom">
            <span
              slot="reference"
              class="block"
              :style="{ backgroundColor: style.associativeLineTextColor }"
            ></span>
            <Color
              :color="style.associativeLineTextColor"
              @change="
                color => {
                  update('associativeLineTextColor', color)
                }
              "
            ></Color>
          </DelayedPopover>
        </div>
        <div class="rowItem">
          <span class="name">{{ $t('baseStyle.fontSize') }}</span>
          <el-select
            size="mini"
            style="width: 80px"
            v-model="style.associativeLineTextFontSize"
            placeholder=""
            @change="update('associativeLineTextFontSize', $event)"
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
      </div>
        </el-tab-pane>
        <el-tab-pane :label="$t('baseStyle.sectionNode')" name="node">
      <section v-if="showNodeUseLineStyle" class="configSection">
        <div class="title noTop">{{ $t('baseStyle.nodeBorderType') }}</div>
        <div class="row noBottom">
          <div class="rowItem">
            <el-checkbox
              v-model="style.nodeUseLineStyle"
              @change="value => update('nodeUseLineStyle', value)"
              >{{ $t('baseStyle.nodeUseLineStyle') }}</el-checkbox
            >
          </div>
        </div>
      </section>
      <section class="configSection">
        <div class="title" :class="{ noTop: !showNodeUseLineStyle }">{{
          $t('baseStyle.nodeMargin')
        }}</div>
        <div class="sectionHint">{{ $t('baseStyle.nodeMarginHint') }}</div>
        <el-tabs
          class="tab marginLevelTabs"
          v-model="marginActiveTab"
          @tab-click="initMarginStyle"
        >
          <el-tab-pane
            :label="$t('baseStyle.level2Node')"
            name="second"
          ></el-tab-pane>
          <el-tab-pane
            :label="$t('baseStyle.belowLevel2Node')"
            name="node"
          ></el-tab-pane>
        </el-tabs>
        <div class="row noBottom">
          <ThemeSlider
            :mindMap="mindMap"
            :label="$t('baseStyle.horizontal')"
            v-model="style.marginX"
            :max="200"
            @input="value => previewMargin('marginX', value)"
            @change="value => updateMargin('marginX', value)"
          ></ThemeSlider>
        </div>
        <div class="row">
          <ThemeSlider
            :mindMap="mindMap"
            :label="$t('baseStyle.vertical')"
            v-model="style.marginY"
            :max="200"
            @input="value => previewMargin('marginY', value)"
            @change="value => updateMargin('marginY', value)"
          ></ThemeSlider>
        </div>
      </section>
      <section class="configSection">
        <div class="title">{{ $t('baseStyle.nodePadding') }}</div>
        <div class="row noBottom">
          <ThemeSlider
            :mindMap="mindMap"
            :label="$t('baseStyle.horizontal')"
            v-model="style.paddingX"
            @input="value => previewThemeKey('paddingX', value)"
            @change="value => update('paddingX', value)"
          ></ThemeSlider>
        </div>
        <div class="row">
          <ThemeSlider
            :mindMap="mindMap"
            :label="$t('baseStyle.vertical')"
            v-model="style.paddingY"
            @input="value => previewThemeKey('paddingY', value)"
            @change="value => update('paddingY', value)"
          ></ThemeSlider>
        </div>
      </section>
      <section class="configSection">
        <div class="title">{{ $t('baseStyle.image') }}</div>
        <div class="row noBottom">
          <ThemeSlider
            :mindMap="mindMap"
            :label="$t('baseStyle.maximumWidth')"
            v-model="style.imgMaxWidth"
            width="140px"
            :min="10"
            :max="500"
            @input="value => previewThemeKey('imgMaxWidth', value)"
            @change="value => update('imgMaxWidth', value)"
          ></ThemeSlider>
        </div>
        <div class="row">
          <ThemeSlider
            :mindMap="mindMap"
            :label="$t('baseStyle.maximumHeight')"
            v-model="style.imgMaxHeight"
            width="140px"
            :min="10"
            :max="500"
            @input="value => previewThemeKey('imgMaxHeight', value)"
            @change="value => update('imgMaxHeight', value)"
          ></ThemeSlider>
        </div>
      </section>
      <section class="configSection">
        <div class="title">{{ $t('baseStyle.icon') }}</div>
        <div class="row">
          <ThemeSlider
            :mindMap="mindMap"
            :label="$t('baseStyle.size')"
            v-model="style.iconSize"
            :min="12"
            :max="50"
            @input="value => previewThemeKey('iconSize', value)"
            @change="value => update('iconSize', value)"
          ></ThemeSlider>
        </div>
      </section>
      <section class="configSection configSection--last">
        <div class="title">{{ $t('baseStyle.outerFramePadding') }}</div>
        <div class="row noBottom">
          <ThemeSlider
            :mindMap="mindMap"
            :label="$t('baseStyle.horizontal')"
            v-model="outerFramePadding.outerFramePaddingX"
            @input="value => previewOuterFramePaddingKey('outerFramePaddingX', value)"
            @change="value => updateOuterFramePadding('outerFramePaddingX', value)"
          ></ThemeSlider>
        </div>
        <div class="row">
          <ThemeSlider
            :mindMap="mindMap"
            :label="$t('baseStyle.vertical')"
            v-model="outerFramePadding.outerFramePaddingY"
            @input="value => previewOuterFramePaddingKey('outerFramePaddingY', value)"
            @change="value => updateOuterFramePadding('outerFramePaddingY', value)"
          ></ThemeSlider>
        </div>
      </section>
        </el-tab-pane>
      </el-tabs>
    </div>
  </Sidebar>
</template>

<script>
import Sidebar from './Sidebar.vue'
import Color from './Color.vue'
import ThemeSlider from '@/components/ThemeSlider.vue'
import {
  lineWidthList,
  lineStyleList,
  backgroundRepeatList,
  backgroundPositionList,
  backgroundSizeList,
  fontFamilyList,
  fontSizeList,
  rootLineKeepSameInCurveList,
  lineStyleMap,
  borderDasharrayList
} from '@/config'
import ImgUpload from '@/components/ImgUpload/index.vue'
import { storeData, storeConfig } from '@/api'
import { mapState } from 'vuex'
import {
  supportLineStyleLayoutsMap,
  supportLineRadiusLayouts,
  supportNodeUseLineStyleLayouts,
  supportRootLineKeepSameInCurveLayouts,
  rainbowLinesOptions
} from '@/config/constant'
import sidebarPanelDebug from '@/mixins/sidebarPanelDebug'
import sidebarHistorySync from '@/mixins/sidebarHistorySync'
import {
  applyRainbowLinesConfig,
  commitOuterFramePadding,
  commitThemeField,
  commitThemeMargin,
  normalizeThemeFieldValue,
  persistThemeConfig,
  previewOuterFramePadding,
  previewThemeField,
  previewThemeMargin,
  readThemeMargin
} from '@/utils/editHistory'

// 基础样式
export default {
  name: 'BaseStyle',
  mixins: [sidebarPanelDebug, sidebarHistorySync],
  components: {
    Sidebar,
    Color,
    ImgUpload,
    ThemeSlider,
    DelayedPopover: () => import('@/components/DelayedPopover.vue')
  },
  props: {
    data: {
      type: [Object, null]
    },
    configData: {
      type: Object
    },
    mindMap: {
      type: Object
    }
  },
  data() {
    return {
      rainbowLinesOptions,
      lineWidthList,
      fontSizeList,
      lineStyleMap,
      activeTab: 'color',
      sectionTab: 'canvas',
      marginActiveTab: 'second',
      style: {
        backgroundColor: '',
        lineColor: '',
        lineWidth: '',
        lineStyle: '',
        showLineMarker: '',
        rootLineKeepSameInCurve: '',
        rootLineStartPositionKeepSameInCurve: '',
        lineRadius: 0,
        lineFlow: false,
        lineFlowForward: true,
        lineFlowDuration: 1,
        generalizationLineWidth: '',
        generalizationLineColor: '',
        associativeLineColor: '',
        associativeLineWidth: 0,
        associativeLineActiveWidth: 0,
        associativeLineDasharray: '',
        associativeLineActiveColor: '',
        associativeLineTextFontSize: 0,
        associativeLineTextColor: '',
        associativeLineTextFontFamily: '',
        paddingX: 0,
        paddingY: 0,
        imgMaxWidth: 0,
        imgMaxHeight: 0,
        iconSize: 0,
        backgroundImage: '',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: '',
        backgroundSize: '',
        marginX: 0,
        marginY: 0,
        nodeUseLineStyle: false
      },
      curRainbowLineColorList: null,
      currentLayout: '', // 当前结构
      outerFramePadding: {
        outerFramePaddingX: 0,
        outerFramePaddingY: 0
      },
      bgListExpand: true
    }
  },
  computed: {
    ...mapState({
      activeSidebar: state => state.activeSidebar,
      localConfig: state => state.localConfig,
      isDark: state => state.localConfig.isDark,
      bgList: state => state.bgList
    }),
    lineStyleList() {
      return lineStyleList[this.$i18n.locale] || lineStyleList.zh
    },
    rootLineKeepSameInCurveList() {
      return (
        rootLineKeepSameInCurveList[this.$i18n.locale] ||
        rootLineKeepSameInCurveList.zh
      )
    },
    backgroundRepeatList() {
      return backgroundRepeatList[this.$i18n.locale] || backgroundRepeatList.zh
    },
    backgroundPositionList() {
      return (
        backgroundPositionList[this.$i18n.locale] || backgroundPositionList.zh
      )
    },
    backgroundSizeList() {
      return backgroundSizeList[this.$i18n.locale] || backgroundSizeList.zh
    },
    fontFamilyList() {
      return fontFamilyList[this.$i18n.locale] || fontFamilyList.zh
    },
    showNodeUseLineStyle() {
      return supportNodeUseLineStyleLayouts.includes(this.currentLayout)
    },
    showLineRadius() {
      return (
        this.style.lineStyle === 'straight' &&
        supportLineRadiusLayouts.includes(this.currentLayout)
      )
    },
    lineStyleListShow() {
      const res = []
      this.lineStyleList.forEach(item => {
        const list = supportLineStyleLayoutsMap[item.value]
        if (list) {
          if (list.includes(this.currentLayout)) {
            res.push(item)
          }
        } else {
          res.push(item)
        }
      })
      return res
    },
    showRootLineKeepSameInCurveLayouts() {
      return supportRootLineKeepSameInCurveLayouts.includes(this.currentLayout)
    },
    borderDasharrayList() {
      return borderDasharrayList[this.$i18n.locale] || borderDasharrayList.zh
    }
  },
  watch: {
    sectionTab(val) {
      if (val === 'node') {
        this.initMarginStyle()
      }
    },
    activeSidebar(val, oldVal) {
      this.logSidebarPanelWatch('baseStyle', val, oldVal)
      if (val === 'baseStyle') {
        this.$refs.sidebar.show = true
        this.initStyle()
        this.initRainbowLines()
        this.initOuterFramePadding()
        this.currentLayout = this.mindMap.getLayout()
        this.logSidebarPanelWatch('baseStyle', val, oldVal, { branch: 'show-true' })
      } else {
        this.$refs.sidebar.show = false
        this.logSidebarPanelWatch('baseStyle', val, oldVal, { branch: 'show-false' })
      }
    },
    lineStyleListShow: {
      deep: true,
      handler() {
        const has = this.lineStyleListShow.find(item => {
          return item.value === this.style.lineStyle
        })
        if (!has) {
          this.style.lineStyle = this.lineStyleListShow[0].value
        }
      }
    }
  },
  mounted() {
    this.logSidebarPanelMounted('baseStyle')
    if (this.activeSidebar === 'baseStyle' && this.$refs.sidebar) {
      this.$refs.sidebar.show = true
      this.initStyle()
      this.initRainbowLines()
      this.initOuterFramePadding()
      this.currentLayout = this.mindMap.getLayout()
    }
  },
  created() {
    this.logSidebarPanelCreated('baseStyle')
    this.$bus.$on('setData', this.onSetData)
  },
  beforeDestroy() {
    this.$bus.$off('setData', this.onSetData)
  },
  methods: {
    onSetData() {
      if (this.activeSidebar !== 'baseStyle') return
      setTimeout(() => {
        this.initStyle()
      }, 0)
    },

    syncFromEditHistory() {
      if (!this.mindMap || !this.data) return
      this.data.theme.config = this.mindMap.getCustomThemeConfig()
      this.initStyle()
      this.initRainbowLines()
      this.initOuterFramePadding()
      this.currentLayout = this.mindMap.getLayout()
    },

    // 初始样式
    initStyle() {
      const marginKeys = ['marginX', 'marginY']
      Object.keys(this.style).forEach(key => {
        if (marginKeys.includes(key)) return
        this.style[key] = this.mindMap.getThemeConfig(key)
        if (key === 'backgroundImage' && this.style[key] === 'none') {
          this.style[key] = ''
        }
      })
      this.initMarginStyle()
    },

    // 初始化彩虹线条配置
    initRainbowLines() {
      const config = this.mindMap.getConfig('rainbowLinesConfig') || {}
      this.curRainbowLineColorList = config.open
        ? this.mindMap.rainbowLines
          ? this.mindMap.rainbowLines.getColorsList()
          : null
        : null
    },

    // 外框
    initOuterFramePadding() {
      this.outerFramePadding.outerFramePaddingX = this.mindMap.getConfig(
        'outerFramePaddingX'
      )
      this.outerFramePadding.outerFramePaddingY = this.mindMap.getConfig(
        'outerFramePaddingY'
      )
    },

    // margin初始值
    initMarginStyle() {
      const margin = readThemeMargin(this.mindMap, this.marginActiveTab)
      this.style.marginX = Number(margin.marginX ?? 0)
      this.style.marginY = Number(margin.marginY ?? 0)
    },

    previewThemeKey(key, value) {
      const normalized = normalizeThemeFieldValue(key, value)
      this.style[key] = normalized
      previewThemeField(this.mindMap, key, normalized)
    },

    // 更新配置（松手提交，写入一条历史）
    update(key, value) {
      const normalized = normalizeThemeFieldValue(key, value)
      this.style[key] = normalized
      this.data.theme.config[key] = normalized
      this.$bus.$emit('showLoading')
      commitThemeField(this.mindMap, key, normalized)
      persistThemeConfig(this.mindMap, this.data.theme.config)
    },

    // 更新彩虹线条配置
    updateRainbowLinesConfig(item) {
      this.curRainbowLineColorList = item.list || null
      let newConfig = null
      if (item.list) {
        newConfig = {
          open: true,
          colorsList: item.list
        }
      } else {
        newConfig = {
          open: false
        }
      }
      this.configData.rainbowLinesConfig = newConfig
      applyRainbowLinesConfig(this.mindMap, newConfig)
      storeConfig(this.configData)
    },

    previewOuterFramePaddingKey(prop, value) {
      this.outerFramePadding[prop] = value
      previewOuterFramePadding(this.mindMap, { [prop]: value })
    },

    updateOuterFramePadding(prop, value) {
      this.outerFramePadding[prop] = value
      this.configData[prop] = value
      commitOuterFramePadding(this.mindMap, { [prop]: value })
      storeConfig(this.configData)
    },

    previewMargin(type, value) {
      this.style[type] = value
      previewThemeMargin(this.mindMap, this.marginActiveTab, type, value)
    },

    updateMargin(type, value) {
      this.style[type] = value
      commitThemeMargin(this.mindMap, this.marginActiveTab, type, value)
      if (this.data.theme && this.data.theme.config) {
        if (!this.data.theme.config[this.marginActiveTab]) {
          this.data.theme.config[this.marginActiveTab] = {}
        }
        this.data.theme.config[this.marginActiveTab][type] = value
      }
    },

    useBg(bg) {
      this.update('backgroundImage', bg)
    }
  }
}
</script>

<style lang="less" scoped>
.baseStyleSectionTabs {
  /deep/ .el-tabs__header {
    margin-bottom: 12px;
  }

  /deep/ .el-tabs__item {
    font-size: 13px;
    padding: 0 10px;
  }

  /deep/ .el-tabs__content {
    overflow: visible;
  }
}

.configSection {
  padding-bottom: 14px;
  margin-bottom: 14px;
  border-bottom: 1px solid #eceef2;

  &--last {
    margin-bottom: 0;
    padding-bottom: 0;
    border-bottom: none;
  }
}

.marginLevelTabs {
  margin-bottom: 8px;
}

.sliderWrap {
  width: 100%;
  min-height: 32px;

  /deep/ .el-slider {
    flex: 1;
    min-width: 120px;
  }
}

.sectionHint {
  font-size: 12px;
  line-height: 1.5;
  color: #888;
  margin-bottom: 10px;
}

.sidebarContent {
  padding: 20px;
  padding-top: 10px;

  &.isDark {
    .configSection {
      border-bottom-color: rgba(255, 255, 255, 0.08);
    }

    .sectionHint {
      color: hsla(0, 0%, 100%, 0.55);
    }
  }

  &.isDark {
    .title {
      color: #fff;
    }

    .row {
      .rowItem {
        .name,
        .curRainbowLine {
          color: hsla(0, 0%, 100%, 0.6);
        }
      }
    }
  }

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

    &.column {
      flex-direction: column;
    }

    .tab {
      width: 100%;
    }

    .imgUpload {
      margin-bottom: 5px;
    }

    .btnGroup {
      width: 100%;
      display: flex;
      justify-content: space-between;
    }

    .rowItem {
      display: flex;
      align-items: center;
      margin-bottom: 5px;

      &.spaceBetween {
        justify-content: space-between;
      }

      .name {
        font-size: 12px;
        margin-right: 10px;
        white-space: nowrap;
      }

      .block {
        display: inline-block;
        width: 30px;
        height: 30px;
        border: 1px solid #dcdfe6;
        border-radius: 4px;
        cursor: pointer;
      }

      .curRainbowLine {
        height: 24px;
        border: 1px solid #dcdfe6;
        font-size: 12px;
        width: 240px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }

      .iconBtn {
        cursor: pointer;
        transition: all 0.3s;

        &.top {
          transform: rotateZ(-180deg);
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

      .colorShow {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 2px;
      }
    }

    .bgList {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      height: 75px;

      &.expand {
        height: max-content;
      }

      .bgItem {
        width: 120px;
        height: 73px;
        border: 1px solid #e9e9e9;
        border-radius: 5px;
        overflow: hidden;
        padding: 5px;
        margin-bottom: 8px;
        cursor: pointer;

        &.active {
          border-color: #409eff;
        }

        img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
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

.lineStyleOption {
  &.isDark {
    svg {
      path {
        stroke: #fff;
      }
    }
  }

  &.isSelected {
    svg {
      path {
        stroke: #409eff;
      }
    }
  }

  svg {
    margin-top: 4px;

    path {
      stroke: #000;
    }
  }
}

.rainbowLinesOptionsBox {
  width: 200px;

  &.isDark {
    .optionItem {
      color: hsla(0, 0%, 100%, 0.6);

      &:hover {
        background-color: hsla(0, 0%, 100%, 0.05);
      }
    }
  }

  .optionItem {
    width: 100%;
    height: 30px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
      background-color: #f5f7fa;
    }
  }
}

.colorsBar {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;

  .colorItem {
    flex: 1;
    height: 15px;
  }
}
</style>
