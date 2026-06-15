import { mindmapDevDebug } from '@/utils/mindmapDevDebug'
import { normalizeMindMapTreeRoot } from '@/utils/editHistory/treeSnapshot'

export function editHistoryDebug(label, data = {}) {
  mindmapDevDebug('edit-history', label, data)
}

export { normalizeMindMapTreeRoot }
