# EditorHub Desktop App

Electron desktop shell for EditorHub. The web UI is the same `apps/web/build` bundle as production web, but API access uses IPC and a custom protocol instead of a fixed localhost port.

## Architecture

| Layer | Mechanism |
| --- | --- |
| Main window | `editorhub://app/index.html` (`editorHubProtocol`) |
| File / catalog API | Renderer → IPC `editorhub:api` → internal Express on random loopback |
| Catalog change events | IPC `editorhub:catalog-change` (not `EventSource`) |
| iframe / streaming `fetch('/api/…')` | `editorhub://` protocol proxies `/api/*` to loopback |
| Library (`/api/library/*`) | JSON in `%AppData%/EditorHub/data/library-store.json` |
| TTD chats (`/api/ttd-chats`) | JSON in `ttd-chats.json`; IndexedDB remains offline fallback |
| AI settings / proxy / MindMap AI | JSON `ai-settings.json` — no `better-sqlite3` in Desktop main process |
| User-visible port | None (no `:3033` in normal desktop startup) |

`yarn start:desktop:server` still runs Express on a fixed port for API-only debugging without Electron.

## Development

Build the web app first so Electron can serve `apps/web/build`, then open the desktop window:

```bash
yarn build:desktop:verify
yarn start:desktop
```

For API-only debugging without opening Electron:

```bash
yarn start:desktop:server
```

For local shortcuts, use:

```bash
./_scripts/desktop.sh --start
./_scripts/desktop.sh --server
./_scripts/desktop.sh --status
```

Optional client diagnostics:

- **Release pack:** set `EDITORHUB_DESKTOP_DEBUG=1` before launch.
- **Debug pack:** build with `yarn build:desktop:dist:debug` (or `EDITORHUB_DESKTOP_DEBUG_PACK=1`). The installer/portable is named **EditorHub Debug** and enables diagnostics automatically — logs go to `desktop-op-*.log` under `%LOCALAPPDATA%\\EditorHub\\logs` (and settings → debug logging is allowed without extra env).

The catalog root (`userData/catalog`) stores desktop metadata only — not your documents. Documents live in folders you add from the sidebar; legacy `--workspace` CLI inputs are ignored. On startup, older `.editorhub` indexes are migrated into `catalog/.editorhub` automatically.

## Packaging

```bash
yarn build:desktop        # Web + MindMap build, then Windows installer + portable exe
yarn build:desktop:dist:debug  # same, but debug pack (EditorHub Debug *.exe)
yarn build:desktop:pack   # unpacked Electron app for quick inspection
yarn build:desktop:verify # verify existing Web build and desktop runtime modules
```

Debug pack sets `EDITORHUB_DESKTOP_DEBUG_PACK=1` at build time (Web `VITE_APP_DEPLOY_DEBUG=true` + baked `desktopBuildFlags.json`). On Windows without bash, use `node scripts/build-desktop-dist.mjs --debug`.

Desktop artifacts are written to:

```text
dist/desktop/
```

## Local Workspace Mapping

The adapter indexes documents only from folders you explicitly add in the sidebar. Desktop metadata is stored in:

```text
<catalog-root>/.editorhub/
  workspace.json
  thumbnails/
  archives/
```

User documents stay in their original mapped folders on disk. The sidecar metadata keeps stable document ids, folder ids, sort order, content hashes, thumbnails, and archive indexes.

## Data storage layout (platform conventions)

EditorHub follows the same split as VS Code, Obsidian, and Electron guidance:

| What | Windows | macOS | Linux |
| --- | --- | --- | --- |
| App config + state (`userData`) | `%APPDATA%\EditorHub\` | `~/Library/Application Support/EditorHub/` | `~/.config/EditorHub/` |
| Default save folder | `%USERPROFILE%\Documents\EditorHub\` | `~/Documents/EditorHub/` | `~/Documents/EditorHub/` |
| Cache (Chromium) | `%LOCALAPPDATA%\EditorHub\cache\` | `~/Library/Caches/EditorHub/cache/` | `$XDG_CACHE_HOME/EditorHub/cache/` |
| Logs | `%LOCALAPPDATA%\EditorHub\logs\` | `~/Library/Logs/EditorHub/` | `$XDG_STATE_HOME/EditorHub/logs/` |

Under `userData` (subfolders only — never write app JSON at the `userData` root):

```text
data/       — AI settings, library store, TTD chats (EXCALIDRAW_DATA_DIR)
catalog/    — folder-mapping index (.editorhub); not your document files
```

Chromium session data (`Local Storage`, `IndexedDB`, etc.) also lives under `userData` automatically.
