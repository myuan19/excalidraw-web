# EditorHub Desktop App

This directory contains the Electron desktop app. It keeps the existing web app
and `/api/files/*` contract intact, then starts a local Express server with a
folder mapping adapter inside the Electron main process.

## Development

Build the web app first so Electron can serve `apps/web/build`, then open the
desktop window:

```bash
yarn build:desktop:verify
yarn start:desktop -- --workspace /path/to/workspace
```

For API-only debugging without opening Electron:

```bash
yarn start:desktop:server -- --workspace /path/to/workspace
```

For local shortcuts, use:

```bash
./_scripts/desktop.sh --start --workspace /path/to/workspace
./_scripts/desktop.sh --server --workspace /path/to/workspace
./_scripts/desktop.sh --status
```

If no workspace is provided, the packaged Electron app uses its user data
directory and creates a `workspace/` folder automatically.

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

The adapter maps documents from the selected workspace folder and stores
desktop metadata in:

```text
<workspace>/.editorhub/
  workspace.json
  thumbnails/
  archives/
```

User documents stay in the visible workspace folder. The sidecar metadata keeps
stable document ids, folder ids, sort order, content hashes, thumbnails, and
archive indexes.
