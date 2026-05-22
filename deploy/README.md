# Deploy

Docker and compose files for this fork. Build context is always the **repository root** (`..` from this folder).

| File | Purpose |
|------|---------|
| `Dockerfile` | Static frontend only (nginx) |
| `Dockerfile.full` | Full stack: SPA + Express API + nginx |
| `docker-compose.yml` | Upstream-style dev container |
| `docker-compose.full.yml` | Production full-stack compose |

```bash
# Full stack (recommended for self-host)
docker compose -f deploy/docker-compose.full.yml up -d --build

# Or via helper script (gitignored local scripts)
./_scripts/deploy.sh ship
```

Data volume: `excalidraw_web_data` → `/var/lib/excalidraw` in container.
