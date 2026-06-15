import { isMindmapDevDebugEnabled } from '@/utils/mindmapDevDebug'

let origin = typeof performance !== 'undefined' ? performance.now() : 0
const marks = []

export function resetMindmapLoadTimeline(reason = 'reset') {
  origin = performance.now()
  marks.length = 0
  mindmapLoadMark('timeline reset', { reason })
}

function isMindmapLoadDebugEnabled() {
  if (isMindmapDevDebugEnabled()) {
    return true
  }
  if (typeof window === 'undefined') {
    return false
  }
  try {
    return (
      window.__MINDMAP_LOAD_DEBUG__ === true ||
      window.localStorage.getItem('mindmapLoadDebug') === '1'
    )
  } catch (error) {
    return false
  }
}

export function mindmapLoadMark(label, data = {}) {
  if (!isMindmapLoadDebugEnabled()) {
    return
  }
  const now = performance.now()
  const entry = {
    label,
    t: Math.round(now),
    sinceOrigin: Math.round(now - origin),
    ...(data || {})
  }
  marks.push(entry)
  const prev = marks.length > 1 ? marks[marks.length - 2] : null
  const delta = prev ? entry.sinceOrigin - prev.sinceOrigin : entry.sinceOrigin
  console.log(`[DEBUG] mindmap-load | ${label}`, {
    ...entry,
    deltaSincePrev: delta
  })
}

export function mindmapLoadSummary(label, data = {}) {
  if (!isMindmapLoadDebugEnabled()) {
    return
  }
  console.log(`[DEBUG] mindmap-load | ${label}`, {
    t: Math.round(performance.now()),
    sinceOrigin: Math.round(performance.now() - origin),
    markCount: marks.length,
    marks: marks.map(item => ({
      label: item.label,
      sinceOrigin: item.sinceOrigin
    })),
    ...(data || {})
  })
}
