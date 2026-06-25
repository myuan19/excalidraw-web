import { describe, expect, it } from 'vitest'

import {
  pickMindMapPersistedConfig,
  resolveMindMapContainerEl,
} from './mindMapConstructorOptions.js'

describe('mindMapConstructorOptions', () => {
  it('strips reserved constructor keys from persisted config', () => {
    const picked = pickMindMapPersistedConfig({
      el: '#bad',
      data: { root: {} },
      outerFramePaddingX: 12,
      maxNodeImageStorageBytes: 1,
    })
    expect(picked).toEqual({
      outerFramePaddingX: 12,
      maxNodeImageStorageBytes: 1,
    })
  })

  it('resolveMindMapContainerEl prefers live DOM ref', () => {
    const el = document.createElement('div')
    el.id = 'mindMapContainer'
    document.body.appendChild(el)
    expect(resolveMindMapContainerEl({ $refs: {} })).toBe(el)
    el.remove()
  })
})
