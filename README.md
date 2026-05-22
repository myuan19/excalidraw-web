# Excalidraw Web (Fork)

Self-hosted drawing space: file list, Excalidraw canvas, MindMap editor, embed sharing.

## Repository layout

```text
app/        Host application (routing, sync, file list, editor shells)
server/     Express API + SQLite + on-disk JSON
packages/   @excalidraw/* editor libraries (see app/editors/excalidraw/native/)
public/     Static assets (MindMap build → public/mind-map/)
lib/        Shared logger (app + server)
scripts/    Monorepo build tooling
deploy/     Dockerfiles and compose
_archive/   Experiments, old v0.3 shell, upstream docs/examples (reference only)
```

Local dev helpers: `_scripts/` (gitignored).

## Quick start

```bash
yarn install
./_scripts/dev.sh --all    # API :3033 + MindMap + Vite
```

Production build:

```bash
yarn build
yarn docker:full              # deploy/docker-compose.full.yml
```

## Commands

| Command | Description |
|---------|-------------|
| `yarn start` | Vite dev server (app/) |
| `yarn build` | Production frontend build |
| `yarn test:typecheck` | TypeScript check |
| `yarn test:app` | Vitest unit tests |
| `yarn docker:full` | Full-stack Docker compose |
| `./_scripts/deploy.sh ship` | Build + Docker deploy |

## License

MIT — based on [Excalidraw](https://excalidraw.com). Upstream marketing docs and examples are under `_archive/upstream/`.
