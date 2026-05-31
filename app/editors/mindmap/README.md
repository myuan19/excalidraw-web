# MindMap editor module

| File / dir | Role |
|------------|------|
| `MindMapEditorShell.tsx` | React host: iframe, postMessage bridge, AI/archive UI |
| `useMindMapFileSave.ts` | Draft hash, local cache, server save |
| `native/` | **Source**: `simple-mind-map` library + `web/` Vue UI |
| `../../public/mind-map/` | **Served build** at URL `/mind-map/` (sync from `native/` after build) |

Build native UI:

```bash
cd native/web
NODE_OPTIONS=--openssl-legacy-provider yarn build
# syncs native/index.html + native/dist/** → public/mind-map/
```

Dev / prod use the **same iframe URL**: `/mind-map/index.html` on the main app origin (Vite in dev, static host in prod). There is no separate MindMap dev port.

Node content uses **Quill rich text (HTML in `data.text`)** — Markdown import/export and per-node Markdown editing are not supported.

Viewport / initial framing for **embed**, **editor**, and **thumbnail** are documented in [`VIEWPORT.md`](./VIEWPORT.md).

- `./_scripts/dev.sh --all` — ensures `public/mind-map/` is built, then starts API + Vite
- `./_scripts/dev.sh --mindmap` — build + watch native sources (rebuilds `public/mind-map/` on change)
