# MindMap viewport strategies

MindMap has **three viewport strategies**. Embed, editor, and thumbnail share the same **focused viewBox math** (`computeMindMapFocusedViewBoxFromNodeBounds`); they differ by multiplier and application layer.

| Strategy | Use case | Algorithm | Config multiplier |
| --- | --- | --- | --- |
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

Defaults live in `native/previewViewportConfig.json` (`thumbnailRootScreenRatioMultiplier` `0.7`, `editorRootScreenRatioMultiplier` `0.1125`, `embedFocusedRootScreenRatioMultiplier` `0.12`). Root offset: `centerTowardOthersRatio` `0.55`, `rootCenterLimitRatio` `0.8` (thumbnail + canvas each have `thumbnail*` / `editorEmbed*` keys with the same values).

## File map

| File | Role |
| --- | --- |
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

Canvas effective root ratio ≈ `0.224 × multiplier` (editor ~`0.025`, embed ~`0.027`). Thumbnail ~`0.157`.

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
| --- | --- |
| Embed zoom / root size in frame | `embedFocusedRootScreenRatioMultiplier` |
| Editor initial zoom (no saved view) | `editorRootScreenRatioMultiplier` |
| Thumbnail crop | `thumbnailRootScreenRatioMultiplier` |
| Offset toward children (default `0.55` / `0.8`) | `thumbnailCenterTowardOthersRatio`, `thumbnailRootCenterLimitRatio`, `editorEmbedCenterTowardOthersRatio`, `editorEmbedRootCenterLimitRatio` |
| Legacy shared offset (fallback) | `centerTowardOthersRatio`, `rootCenterLimitRatio` |
| Node count vs zoom (0–1, default 1) | `nodeCountScaleInfluence` (thumbnail), `editorEmbedNodeCountScaleInfluence` (canvas) |
| Lone root only (canvas) | `editorEmbedSingleRootOnlyVisualScaleFactor` — default `1` (no extra shrink) |
| Lone root only (thumbnail) | `thumbnailSingleRootOnlyVisualScaleFactor` — default `1` (match editor) |
| Document has only data root (renderer may have expand chrome) | `filterMindMapFocusedNodeBounds` — canvas uses root bounds only |

## Tests

- `app/embed/embedPreviewRange.source.test.ts`
- `app/data/thumbnailSvg.test.ts`
- `app/data/embedDocument.test.ts`
