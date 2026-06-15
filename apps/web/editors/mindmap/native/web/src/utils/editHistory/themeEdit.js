import { storeData } from '@/api'
import { recordEditHistory } from './core'
import defaultTheme from 'simple-mind-map/src/theme/default'
import { mergeTheme, simpleDeepClone } from 'simple-mind-map/src/utils'
import themeList from 'simple-mind-map-plugin-themes/themeList'

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]'
}

function isSameValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function getThemeBaseConfig(themeName) {
  if (!themeName || themeName === 'default') {
    return simpleDeepClone(defaultTheme)
  }
  const target = themeList.find(item => item.value === themeName)
  return mergeTheme(defaultTheme, target && target.theme ? target.theme : {})
}

function compactConfigAgainstBase(config = {}, base = {}) {
  const res = {}
  Object.keys(config || {}).forEach(key => {
    const value = config[key]
    const baseValue = base ? base[key] : undefined
    if (isPlainObject(value) && isPlainObject(baseValue)) {
      const child = compactConfigAgainstBase(value, baseValue)
      if (Object.keys(child).length > 0) {
        res[key] = child
      }
      return
    }
    if (!isSameValue(value, baseValue)) {
      res[key] = simpleDeepClone(value)
    }
  })
  return res
}

function stripGeneratedZeroNodeTabConfig(config = {}, base = {}) {
  const next = simpleDeepClone(config || {})
  const zeroTopKeys = [
    'paddingX',
    'paddingY',
    'imgMaxWidth',
    'imgMaxHeight',
    'iconSize'
  ]
  const zeroTopCount = zeroTopKeys.filter(key => {
    return next[key] === 0 && Number(base[key]) > 0
  }).length
  const zeroMarginBuckets = ['second', 'node'].filter(key => {
    const value = next[key]
    const baseValue = base[key]
    return (
      isPlainObject(value) &&
      isPlainObject(baseValue) &&
      value.marginX === 0 &&
      value.marginY === 0 &&
      (Number(baseValue.marginX) > 0 || Number(baseValue.marginY) > 0)
    )
  })
  const looksGenerated =
    zeroTopCount >= 3 ||
    zeroMarginBuckets.length >= 2 ||
    (zeroTopCount > 0 && zeroMarginBuckets.length > 0)
  if (!looksGenerated) {
    return next
  }
  zeroTopKeys.forEach(key => {
    if (next[key] === 0 && Number(base[key]) > 0) {
      delete next[key]
    }
  })
  zeroMarginBuckets.forEach(key => {
    delete next[key].marginX
    delete next[key].marginY
    if (Object.keys(next[key]).length <= 0) {
      delete next[key]
    }
  })
  return next
}

export function normalizeCustomThemeConfig(config = {}, themeName = 'default') {
  const base = getThemeBaseConfig(themeName)
  return compactConfigAgainstBase(stripGeneratedZeroNodeTabConfig(config, base), base)
}

export function compactCustomThemeConfig(config = {}, themeName = 'default') {
  return normalizeCustomThemeConfig(config, themeName)
}

export function getEffectiveThemeConfig(mindMap) {
  if (!mindMap) {
    return getThemeBaseConfig('default')
  }
  const themeName = mindMap.getTheme()
  return mergeTheme(
    getThemeBaseConfig(themeName),
    normalizeCustomThemeConfig(mindMap.getCustomThemeConfig() || {}, themeName)
  )
}

export function readThemeField(mindMap, key) {
  return getEffectiveThemeConfig(mindMap)[key]
}

export function normalizeThemeFieldValue(key, value) {
  if (key === 'backgroundImage' && value === 'none') {
    return ''
  }
  return value
}

export function previewThemeField(mindMap, key, value) {
  if (!mindMap) return
  const normalized = normalizeThemeFieldValue(key, value)
  const config = compactCustomThemeConfig(
    { ...mindMap.getCustomThemeConfig(), [key]: normalized },
    mindMap.getTheme()
  )
  mindMap.setThemeConfig(config)
}

export function commitThemeField(mindMap, key, value) {
  if (!mindMap) return null
  const normalized = normalizeThemeFieldValue(key, value)
  const config = compactCustomThemeConfig(
    { ...mindMap.getCustomThemeConfig(), [key]: normalized },
    mindMap.getTheme()
  )
  mindMap.setThemeConfig(config)
  return config
}

export function persistThemeConfig(mindMap, config) {
  const compactConfig = compactCustomThemeConfig(config || {}, mindMap.getTheme())
  storeData({
    theme: {
      template: mindMap.getTheme(),
      config: compactConfig
    }
  })
  return compactConfig
}

export function readThemeMargin(mindMap, tab) {
  const themeConfig = getEffectiveThemeConfig(mindMap)
  const bucket = themeConfig[tab] || {}
  return {
    marginX: bucket.marginX ?? 0,
    marginY: bucket.marginY ?? 0
  }
}

export function buildThemeMarginConfig(mindMap, tab, key, value) {
  const config = compactCustomThemeConfig(
    { ...mindMap.getCustomThemeConfig() },
    mindMap.getTheme()
  )
  if (!config[tab]) {
    config[tab] = {}
  }
  config[tab] = {
    ...config[tab],
    [key]: value
  }
  return config
}

export function previewThemeMargin(mindMap, tab, key, value) {
  if (!mindMap) return
  mindMap.setThemeConfig(buildThemeMarginConfig(mindMap, tab, key, value))
}

export function commitThemeMargin(mindMap, tab, key, value) {
  if (!mindMap) return null
  const config = compactCustomThemeConfig(
    buildThemeMarginConfig(mindMap, tab, key, value),
    mindMap.getTheme()
  )
  mindMap.setThemeConfig(config)
  persistThemeConfig(mindMap, config)
  return config
}

export function previewOuterFramePadding(mindMap, patch) {
  if (!mindMap) return
  mindMap.updateConfig(patch)
  mindMap.render()
}

export function commitOuterFramePadding(mindMap, patch) {
  if (!mindMap) return
  mindMap.updateConfig(patch)
  mindMap.render()
  recordEditHistory(mindMap)
}
