/** MindMap 构造参数中由 Edit.vue 注入、不得被持久化 config 覆盖的键 */
const RESERVED_MINDMAP_CONSTRUCTOR_KEYS = new Set([
  'el',
  'data',
  'fit',
  'layout',
  'theme',
  'themeConfig',
  'viewData',
  'view',
  'customInnerElsAppendTo',
  'customNoteContentShow',
])

/** 从 bridge/本地持久化的 config 中剥离运行时字段，避免覆盖 el 等构造参数 */
export function pickMindMapPersistedConfig(config) {
  if (!config || typeof config !== 'object') {
    return {}
  }
  const picked = {}
  Object.keys(config).forEach(key => {
    if (RESERVED_MINDMAP_CONSTRUCTOR_KEYS.has(key)) {
      return
    }
    const value = config[key]
    if (typeof value === 'function') {
      return
    }
    picked[key] = value
  })
  return picked
}

function isMindMapContainerElement(el) {
  return (
    el &&
    typeof el.getBoundingClientRect === 'function' &&
    typeof el.appendChild === 'function'
  )
}

export function resolveMindMapContainerEl(vm) {
  const ref = vm && vm.$refs ? vm.$refs.mindMapContainer : null
  if (isMindMapContainerElement(ref)) {
    return ref
  }
  const byId = document.getElementById('mindMapContainer')
  if (isMindMapContainerElement(byId)) {
    return byId
  }
  return null
}

/** async init 后等待 DOM ref 就绪（iframe 宿主模式下偶发 ref 尚未挂载） */
export async function waitForMindMapContainerEl(vm, maxAttempts = 40) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const el = resolveMindMapContainerEl(vm)
    if (el) {
      return el
    }
    await new Promise(resolve => {
      if (vm && typeof vm.$nextTick === 'function') {
        vm.$nextTick(resolve)
      } else {
        window.requestAnimationFrame(resolve)
      }
    })
  }
  return resolveMindMapContainerEl(vm)
}
