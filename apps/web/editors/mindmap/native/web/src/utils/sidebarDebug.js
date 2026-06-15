import { mindmapDevDebug } from '@/utils/mindmapDevDebug'

let debugSeq = 0

function nextSeq() {
  debugSeq += 1
  return debugSeq
}

function trimStack(stack, depth = 6) {
  if (!stack) {
    return []
  }
  return String(stack)
    .split('\n')
    .slice(1, depth + 1)
    .map(line => line.trim())
}

export function sidebarDebug(label, data = {}) {
  mindmapDevDebug('mindmap-sidebar', label, {
    seq: nextSeq(),
    ...data
  })
}

export function sidebarDebugClick(label, event, data = {}) {
  const point =
    event && typeof event.clientX === 'number'
      ? { clientX: Math.round(event.clientX), clientY: Math.round(event.clientY) }
      : null
  sidebarDebug(label, {
    ...data,
    point
  })
}

export function sidebarDebugSetActiveSidebar(from, to, source = 'unknown') {
  sidebarDebug('setActiveSidebar', {
    from: from || null,
    to: to || null,
    source,
    stack: trimStack(new Error().stack)
  })
}

export function sidebarDebugPanelWatch(panelKey, val, oldVal, extra = {}) {
  sidebarDebug('panel activeSidebar watch', {
    panelKey,
    from: oldVal || null,
    to: val || null,
    ...extra
  })
}

export function sidebarDebugPanelShow(panelKey, from, to, extra = {}) {
  sidebarDebug('panel show changed', {
    panelKey: panelKey || 'unknown',
    from: !!from,
    to: !!to,
    ...extra
  })
}

export function sidebarDebugBus(eventName, payload = {}) {
  sidebarDebug(`bus ${eventName}`, payload)
}

function readMemorySnapshot() {
  if (typeof performance === 'undefined' || !performance.memory) {
    return null
  }
  const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = performance.memory
  return {
    usedMB: Math.round(usedJSHeapSize / 1048576),
    totalMB: Math.round(totalJSHeapSize / 1048576),
    limitMB: Math.round(jsHeapSizeLimit / 1048576)
  }
}

export function sidebarMemoryDebug(label, data = {}) {
  sidebarDebug(`memory ${label}`, {
    ...data,
    heap: readMemorySnapshot()
  })
}
