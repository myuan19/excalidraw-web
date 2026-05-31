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

### MindMap static assets (`/mind-map/dist/`)

Deploy **the entire** `public/mind-map/dist/` (or `app/build/mind-map/dist/`) on every release. `index.html` + `app.*.js` alone are not enough: Vue lazy-loads `chunk-*.js` (~3MB). A partial copy causes `ChunkLoadError` and “原生界面未完成初始化”.

If you put OAuth/auth in front of the site, **exclude** `/mind-map/dist/` (and ideally all `/mind-map/` static files) from login redirects. Otherwise JS chunk requests return HTML 302 pages and the iframe fails to boot.

Large chunks over HTTP/2 through some reverse proxies may show `ERR_HTTP2_PROTOCOL_ERROR`; try HTTP/1.1 for static locations, enable `gzip` for `application/javascript`, or raise proxy buffer limits.

**Symptom: JS 404 or `MIME type ('text/html')` on `/mind-map/dist/js/*.js`**

The SPA `try_files … /index.html` fallback must **not** apply to MindMap chunks. Docker nginx (`deploy/full/nginx.conf`) uses `location ^~ /mind-map/dist/` with `try_files $uri =404`. If you terminate TLS on an outer gateway (e.g. `excalidraw.yuanyuan19.top`), mirror the same rule there:

```nginx
location ^~ /mind-map/dist/ {
    try_files $uri =404;
    # optional: proxy_pass to static root; do NOT auth_redirect .js to login HTML
}
```

Verify after deploy (replace host):

```bash
curl -sI 'https://YOUR_HOST/mind-map/dist/js/app.9d1741a9.js' | head -5
# Expect: HTTP/1.1 200  and  Content-Type: application/javascript
```
