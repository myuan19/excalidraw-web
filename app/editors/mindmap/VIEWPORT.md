# MindMap viewport strategies

MindMap has **three viewport strategies**. Embed, editor, and thumbnail share the same **focused viewBox math** (`computeMindMapFocusedViewBoxFromNodeBounds`); they differ by multiplier and application layer.

| Strategy | Use case | Algorithm | Config multiplier |
|----------|----------|-----------|-------------------|
| **Embed focused** | Read-only embed iframe | Shared focused viewBox + canvas fit | `embedFocusedRootScreenRatioMultiplier` |
| **Editor focused** | Editor with no saved `view` | Same math + canvas fit | `editorRootScreenRatioMultiplier` |
| **Thumbnail** | File list preview SVG | Same math on exported SVG `viewBox` | `thumbnailRootScreenRatioMultiplier` |

Shared framing offset (all focused strategies):

- `centerTowardOthersRatio` — shift viewBox center from root toward subtree center
- `rootCenterLimitRatio` — cap the shift

Effective root screen ratio:

```text
targetRootScreenRatio = baselineRootScreenRatio × <strategyMultiplier>
```

Defaults live in `native/previewViewportConfig.json`.

## File map

| File | Role |
|------|------|
| `native/previewViewportConfig.json` | Single tuning file |
| `mindMapFocusedViewBox.js` | Shared viewBox math + ratio helpers |
| `embed.ts` | Embed payload: strip `view`, inject focused multiplier |
| `MindMapEditorShell.tsx` | Injects editor multiplier when no `view` |
| `native/web/.../Edit.vue` | `applyEmbedFocusedViewport` / `applyEditorFocusedViewport` |
| `native/web/public/index.html` | Bridge restore protocol |
| `app/data/thumbnailSvg.ts` | Thumbnail SVG post-process |

## 1. Embed focused

**Goal:** Read-only preview with the same framing offset as editor/thumbnail, but more zoomed out.

- `initRootNodePosition`: `center / center` (offset from focused viewBox, not layout `%`)
- `fit: false`, `view: null`
- `applyEmbedFocusedViewport('initial-render-end')` on first render
- Reset → restore captured baseline from first focused apply

Multiplier default `0.4` (vs editor `0.75`) keeps embed farther than editor.

## 2. Editor focused

**When document has saved `view`:** restore `viewData` directly.

**When no saved `view`:**

- `applyEditorFocusedViewport('editor-initial-render-end')`
- Multiplier from `MindMapEditorShell` / config

## 3. Thumbnail

Export SVG → `thumbnailSvg.ts` → same `computeMindMapFocusedViewBoxFromNodeBounds` → rewrite `viewBox`.

## Bridge protocol (embed)

```text
Host → restoreMindMapView → bridge → host_restore_preview_view
Edit.vue applyEmbedFocusedViewport → embed_preview_viewport_applied → Host
```

## Tuning guide

| Change | Edit |
|--------|------|
| Embed zoom / root size in frame | `embedFocusedRootScreenRatioMultiplier` |
| Editor initial zoom (no saved view) | `editorRootScreenRatioMultiplier` |
| Thumbnail crop | `thumbnailRootScreenRatioMultiplier` |
| Shared offset toward children | `centerTowardOthersRatio`, `rootCenterLimitRatio` |

## Tests

- `app/embed/embedPreviewRange.source.test.ts`
- `app/data/thumbnailSvg.test.ts`
- `app/data/embedDocument.test.ts`
