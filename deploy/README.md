# Deploy

Docker and compose files for this fork. Build context is always the **repository root** (`..` from this folder).

| File | Purpose |
|------|---------|
| `Dockerfile` | Static frontend only (nginx) |
| `Dockerfile.full` | Full stack: SPA + Express API + nginx |
| `docker-compose.yml` | Upstream-style dev container |
| `docker-compose.full.yml` | Production full-stack compose |
| `vercel.json` | Legacy upstream Vercel headers/redirects (self-host uses Docker) |

```bash
# Full stack (recommended for self-host)
docker compose -f deploy/docker-compose.full.yml up -d --build

# Or via helper script (gitignored local scripts)
./_scripts/deploy.sh ship

# Debug deploy (verbose logs + direct API on host :13033)
DEPLOY_DEBUG=1 ./_scripts/deploy.sh ship
# or: ./_scripts/deploy.sh debug-ship
```

Build pipeline (host or Docker): `yarn build:production` = MindMap iframe + SPA (`app/build/`).

**`./_scripts/deploy.sh ship`** runs host build first, then Docker with `PREBUILT=1` (packages `app/build/` only — **no yarn inside Docker**, avoids registry timeouts). Use plain `deploy` / `docker compose` without host build for full in-container build (`PREBUILT=0`).

Data volume: `excalidraw_web_data` → `/var/lib/excalidraw` in container.
