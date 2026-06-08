import { mindmapDevDebug } from '@/utils/mindmapDevDebug'

export const MINDMAP_ORGANIZE_PROMPT_AREA = 'mindmap-organize'

async function readJsonResponse(res) {
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error(`unexpected content-type: ${contentType || 'unknown'}`)
  }
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data && data.error ? data.error : `request failed: ${res.status}`)
  }
  return data
}

export async function listMindMapOrganizePromptPresets() {
  mindmapDevDebug('mindmap-ai-prompt', 'list presets start')
  const res = await fetch(
    `/api/ai-prompt-presets?area=${encodeURIComponent(
      MINDMAP_ORGANIZE_PROMPT_AREA
    )}`
  )
  const data = await readJsonResponse(res)
  mindmapDevDebug('mindmap-ai-prompt', 'list presets done', {
    count: Array.isArray(data) ? data.length : 0
  })
  return Array.isArray(data) ? data : []
}

export async function saveMindMapOrganizePromptPreset(preset) {
  const body = {
    id: preset.id || undefined,
    area: MINDMAP_ORGANIZE_PROMPT_AREA,
    name: preset.name,
    prompt: preset.prompt,
    options: preset.options || {},
    sort_index: preset.sort_index || 0
  }
  mindmapDevDebug('mindmap-ai-prompt', 'save preset start', {
    hasId: !!body.id,
    name: body.name,
    promptLen: body.prompt ? body.prompt.length : 0,
    optionKeys: Object.keys(body.options)
  })
  const res = await fetch('/api/ai-prompt-presets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  const data = await readJsonResponse(res)
  mindmapDevDebug('mindmap-ai-prompt', 'save preset done', {
    id: data && data.id,
    name: data && data.name
  })
  return data
}

export async function deleteMindMapOrganizePromptPreset(id) {
  mindmapDevDebug('mindmap-ai-prompt', 'delete preset start', { id })
  const res = await fetch(`/api/ai-prompt-presets/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  })
  const data = await readJsonResponse(res)
  mindmapDevDebug('mindmap-ai-prompt', 'delete preset done', { id })
  return data
}
