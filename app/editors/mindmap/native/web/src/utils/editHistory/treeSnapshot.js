import { simpleDeepClone } from 'simple-mind-map/src/utils'

const HISTORY_META_KEYS = [
  'theme',
  'themeConfig',
  'layout',
  'outerFramePaddingX',
  'outerFramePaddingY',
  'rainbowLinesConfig',
  'smmVersion'
]

/** 从历史快照或 data_change 载荷中取出纯树 root */
export function normalizeMindMapTreeRoot(data) {
  if (!data) {
    return null
  }
  if (data.root !== undefined && data.root !== null) {
    return data.root
  }
  if (data.data === undefined) {
    return data
  }
  const root = simpleDeepClone(data)
  HISTORY_META_KEYS.forEach(key => {
    delete root[key]
  })
  return root
}

export function getMindMapTreeFingerprint(mindMap) {
  if (!mindMap || typeof mindMap.getData !== 'function') {
    return ''
  }
  const root = normalizeMindMapTreeRoot(mindMap.getData())
  return root ? JSON.stringify(root) : ''
}
