/**
 * Parse AI-generated mind map tree JSON.
 * Expected shape: { "data": { "text": "..." }, "children": [...] }
 */
export function parseAiTreeJson(content) {
  const raw = String(content || '').trim()
  if (!raw) {
    throw new Error('empty ai tree content')
  }

  let jsonText = raw
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch) {
    jsonText = fenceMatch[1].trim()
  }

  const parsed = JSON.parse(jsonText)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('invalid ai tree json')
  }

  if (!parsed.data || typeof parsed.data !== 'object') {
    throw new Error('invalid ai tree root data')
  }

  if (typeof parsed.data.text !== 'string') {
    parsed.data.text = String(parsed.data.text ?? '')
  }

  if (!Array.isArray(parsed.children)) {
    parsed.children = []
  }

  return parsed
}
