# Native runtime (Excalidraw)

The canvas engine lives in the **yarn workspace packages**, not under this folder:

| Package | Path |
|---------|------|
| Main editor | `packages/excalidraw/` |
| Internals | `packages/common`, `element`, `math`, `utils` |

Host integration (file open/save, fork toolbar, library, embed) is in `../EditorShell.tsx`.

Packages stay at repo root for monorepo tooling (Vite aliases, `yarn build:packages`, npm publish). This directory marks the editor boundary for migration and comparison with `_references/old2-drawing-space-shell`.
