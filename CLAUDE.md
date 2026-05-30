# CLAUDE.md

## Project Structure

Active line (what you edit day-to-day):

```text
app/        Host app — file list, editor shells, sync, embed (see app/editors/)
server/     API + SQLite + file storage
packages/   @excalidraw/* libraries (excalidraw native runtime)
public/     Static assets + public/mind-map/ iframe build
lib/        Shared logger — lib/logger/ (core) + app/lib/ + server/lib/ adapters
scripts/    Build tooling (_scripts/ = dev/deploy helpers, gitignored)
deploy/     Docker + compose + legacy Vercel config
tests/      Vitest global setup
_references/   Reference only — experiments, old shell, upstream docs
```

**Local data (dev only):** `_dev_data/` at repo root. **Logs:** `_dev_data/logs/` via `rotating-file-stream` (size + daily rotation, auto cleanup). See `server/config/logDir.js`.

- **`packages/excalidraw/`** - Main React component library published to npm as `@excalidraw/excalidraw`
- **`app/`** - Full-featured web application (excalidraw.com) that uses the library
- **`packages/`** - Core packages: `@excalidraw/common`, `@excalidraw/element`, `@excalidraw/math`, `@excalidraw/utils`
- **`_references/`** - Reference-only experiments, old v0.3 shell, upstream examples/docs (not in active build)

## Development Workflow

1. **Package Development**: Work in `packages/*` for editor features
2. **App Development**: Work in `app/` for app-specific features
3. **Testing**: Always run `yarn test:update` before committing
4. **Type Safety**: Use `yarn test:typecheck` to verify TypeScript

## Development Commands

```bash
yarn test:typecheck  # TypeScript type checking
yarn test:update     # Run all tests (with snapshot updates)
yarn fix             # Auto-fix formatting and linting issues
```

## Architecture Notes

### Package System

- Uses Yarn workspaces for monorepo management
- Internal packages use path aliases (see `vitest.config.mts`)
- Build system uses esbuild for packages, Vite for the app
- TypeScript throughout with strict configuration
