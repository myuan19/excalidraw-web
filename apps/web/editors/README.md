# Editors

Each document kind is an **EditorPlugin**: metadata + optional host hooks, with editor-specific complexity kept inside `editors/<kind>/`.

```text
editors/
├── types.ts                  EditorPlugin contract
├── registry.ts               Single registration point
├── lazyViews.ts              Cached React.lazy shells/viewers
├── excalidraw/
│   ├── index.ts              Plugin export
│   ├── EditorShell.tsx       React host (toolbar, save, sync)
│   ├── hostActions.ts        createFile / importFile for file list
│   ├── embed.ts              Readonly embed data prep
│   ├── useForkFileSave.ts
│   └── native/               → packages/excalidraw
├── mindmap/
│   ├── index.ts
│   ├── MindMapEditorShell.tsx
│   ├── hostActions.ts
│   ├── embed.ts
│   ├── useMindMapFileSave.ts
│   └── native/               Vue iframe source
└── README.md
```

## Adding an editor

1. Implement `DocumentFormatAdapter` (or reuse one) under `apps/web/data/formats/`.
2. Create `apps/web/editors/<kind>/` with:
   - `index.ts` exporting `EditorPlugin`
   - `loadEditorShell` (required)
   - `loadEmbedViewer` (optional)
   - `createFile` / `importFile` (optional, for file-list UX)
   - `prepareEmbedData` / `buildEmbedPayload` (optional)
3. Register in `registry.ts`:

```ts
export const editorRegistry = createEditorRegistry([
  excalidrawPlugin,
  mindMapPlugin,
  myPlugin,
]);
```

The host app (`App.tsx`, `FileList.tsx`, `EmbedApp.tsx`, `ServerSync`) reads **`editorRegistry` only** — no new `kind === "…"` branches required.

## Runtime URLs

- Excalidraw renders in React.
- MindMap loads `public/mind-map/index.html` in an iframe.

**MindMap build**: from `native/web`, then sync `native/index.html` + `native/dist/**` → `public/mind-map/`.

## Optional at build time

To exclude an editor from a deployment, remove it from the array in `registry.ts` (and drop its static assets if any). No other host changes are required.
