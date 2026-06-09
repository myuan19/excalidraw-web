import { storeData } from '@/api'
import { recordEditHistory } from './core'

export function normalizeThemeFieldValue(key, value) {
  if (key === 'backgroundImage' && value === 'none') {
    return ''
  }
  return value
}

export function previewThemeField(mindMap, key, value) {
  if (!mindMap) return
  const normalized = normalizeThemeFieldValue(key, value)
  const config = { ...mindMap.getThemeConfig(), [key]: normalized }
  mindMap.setThemeConfig(config)
}

export function commitThemeField(mindMap, key, value) {
  if (!mindMap) return null
  const normalized = normalizeThemeFieldValue(key, value)
  const config = { ...mindMap.getThemeConfig(), [key]: normalized }
  mindMap.setThemeConfig(config)
  return config
}

export function persistThemeConfig(mindMap, config) {
  storeData({
    theme: {
      template: mindMap.getTheme(),
      config
    }
  })
}

export function readThemeMargin(mindMap, tab) {
  const themeConfig = mindMap.getThemeConfig()
  const bucket = themeConfig[tab] || {}
  return {
    marginX: bucket.marginX ?? 0,
    marginY: bucket.marginY ?? 0
  }
}

export function buildThemeMarginConfig(mindMap, tab, key, value) {
  const config = { ...mindMap.getThemeConfig() }
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
  const config = buildThemeMarginConfig(mindMap, tab, key, value)
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
