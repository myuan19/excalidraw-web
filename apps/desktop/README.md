# EditorHub Desktop App

Electron desktop shell for EditorHub. The web UI is the same `apps/web/build` bundle as production web, but API access uses IPC and a custom protocol instead of a fixed localhost port.

## Architecture

| Layer | Mechanism |
|-------|-----------|
| Main window | `editorhub://app/index.html` (`editorHubProtocol`) |
| File / catalog API | Renderer → IPC `editorhub:api` → internal Express on random loopback |
| Catalog change events | IPC `editorhub:catalog-change` (not `EventSource`) |
| iframe / streaming `fetch('/api/…')` | `editorhub://` protocol proxies `/api/*` to loopback |
| Library (`/api/library/*`) | JSON in `%AppData%/EditorHub/server-data/library-store.json` |
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

Optional client diagnostics: set `EDITORHUB_DESKTOP_DEBUG=1` before launch. Logs go to `desktop-op.log` via IPC (not `POST /api/logs`).

The catalog root stores desktop metadata only. Documents live in folders you add from the sidebar; legacy `--workspace` CLI inputs are ignored.

## Packaging

```bash
yarn build:desktop        # Web + MindMap build, then Windows installer + portable exe
yarn build:desktop:pack   # unpacked Electron app for quick inspection
yarn build:desktop:verify # verify existing Web build and desktop runtime modules
```

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
