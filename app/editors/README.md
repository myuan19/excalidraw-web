# Editors

Parallel layout for each document kind. Compare with `_archive/old2-drawing-space-shell/src/editors/`.

```text
editors/
├── excalidraw/
│   ├── index.ts              Registry entry
│   ├── EditorShell.tsx       React host (toolbar, save, sync)
│   ├── useForkFileSave.ts
│   └── native/               → packages/excalidraw (see README)
├── mindmap/
│   ├── index.ts
│   ├── MindMapEditorShell.tsx
│   ├── useMindMapFileSave.ts
│   └── native/               Vue iframe source (simple-mind-map + web/)
├── registry.ts
└── types.ts
```

**Runtime URLs** (unchanged): Excalidraw renders in React; MindMap loads `public/mind-map/index.html` in an iframe.

**MindMap build**: from `native/web`, then sync `native/index.html` + `native/dist/**` → `public/mind-map/`.
