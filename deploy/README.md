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

# Interactive menu: ./_scripts/deploy.sh
```

### `./_scripts/deploy.sh` menu

| Option | Type | What it does |
|--------|------|----------------|
| **1) ship** | **One-click** | Host `yarn build:production` → verify `apps/web/build` → Docker deploy → `:17888` |
| **2) debug-ship** | **One-click (debug)** | Same as ship, debug image/container (still only `:17888`, verbose logs) |
| **3) deploy** | **Deploy only** | Docker build + start only — **no** host `yarn build:production` (needs existing `apps/web/build` or in-image build) |
| **4) debug-deploy** | **Deploy only (debug)** | Same as deploy, debug profile |
| 5) build | Other | Docker image only |
| 6) start | Other | Start container |

```bash
# One-click production (recommended for releases)
./_scripts/deploy.sh ship

# One-click debug (replace whatever is on :17888; data unchanged)
./_scripts/deploy.sh debug-ship

# Deploy only — after you already ran yarn build:production
PREBUILT=1 ./_scripts/deploy.sh deploy
```

Build pipeline (host or Docker): `yarn build:production` = MindMap iframe + SPA (`apps/web/build/`).

**`ship` / `debug-ship`** always run host build first, then Docker with `PREBUILT=1` (packages `apps/web/build/` only — **no yarn inside Docker**, avoids registry timeouts). **`deploy` / `debug-deploy`** skip host build; use when artifacts already exist or you accept a full in-container build (`PREBUILT=0`).

Data volume: `editorhub_web_data` → `/var/lib/excalidraw` in container (bind mount default: `/opt/editorhub-web/data`).

### MindMap static assets (`/mind-map/dist/`)

Deploy **the entire** `public/mind-map/dist/` (or `apps/web/build/mind-map/dist/`) on every release. `index.html` + `app.*.js` alone are not enough: Vue lazy-loads `chunk-*.js` (~3MB). A partial copy causes `ChunkLoadError` and “原生界面未完成初始化”.

**Auth model (intended)**

- **Main app** (`editorhub.*`): OAuth/login required for `/`, `/assets/*`, `/mind-map/*`, `/api/*`, etc. After login, the browser sends the session cookie on same-origin `<script src="/mind-map/dist/js/...">` — do **not** whitelist these paths on the public internet.
- **Embed only** (`/embed/...`): token + domain gate on document/API; **content-hashed** `/embed/assets/*`, `/embed/fonts/*`, `/embed/mind-map/dist/*` are public (see `embedAccess.js`). That bypass is **not** for the main editor iframe at `/mind-map/`.

`curl` without a session cookie getting `302` to OAuth on `/mind-map/dist/js/*.js` is **expected**, not a deploy bug.

**Symptom: `ChunkLoadError` / `ERR_HTTP2_PROTOCOL_ERROR` while already logged in on the main app**

1. **Incomplete deploy** — sync the full `apps/web/build/mind-map/dist/js/` (all `chunk-*.js`, not only `app.*.js` + `index.html`). Run `node scripts/verify-mind-map-public.mjs` before release.
2. **HTTP/2 proxy / frp** — lazy chunks are multi‑MB. Some gateways abort with `ERR_HTTP2_PROTOCOL_ERROR` even when auth succeeds. On the **outer** reverse proxy in front of `17888`, for static locations use `proxy_http_version 1.1`, enable `gzip` for `application/javascript`, and raise buffers, e.g.:

```nginx
location ^~ /mind-map/dist/ {
    proxy_http_version 1.1;
    proxy_buffering on;
    proxy_buffers 16 512k;
    proxy_busy_buffers_size 512k;
    # proxy_pass …  (must reach the same static root as deploy/full/nginx.conf)
}
```

3. **OAuth forward-auth** — when the user *is* logged in, the auth middleware must **pass the session cookie through** to upstream for `/mind-map/dist/*` (return 200 + JS, not login HTML). If only navigations get cookies but subresources do not, fix cookie `Domain` / `Path` on the OAuth product so `editorhub.*` receives the session cookie.

Verify **with** a logged-in browser cookie (or `Cookie:` header from DevTools):

```bash
curl -sI 'https://YOUR_HOST/mind-map/dist/js/app.XXXXXXXX.js' \
  -H 'Cookie: YOUR_SESSION=…' | head -8
# Expect: 200  content-type: application/javascript
```

Optional: `HOST=https://YOUR_HOST COOKIE='session=…' node scripts/verify-static-gateway.mjs`

**Symptom: JS 404 or `MIME type ('text/html')` on `/mind-map/dist/js/*.js`**

The SPA `try_files … /index.html` fallback must **not** apply to MindMap chunks. Docker nginx (`deploy/full/nginx.conf`) uses `location ^~ /mind-map/dist/` with `try_files $uri =404`. If you terminate TLS on an outer gateway (e.g. `editorhub.yuanyuan19.top`), mirror the same rule there:

```nginx
location ^~ /mind-map/dist/ {
    try_files $uri =404;
    # optional: proxy_pass to static root; do NOT auth_redirect .js to login HTML
}
```

Verify after deploy (replace host; use a logged-in cookie if your gateway requires auth):

```bash
curl -sI 'https://YOUR_HOST/mind-map/dist/js/app.9d1741a9.js' | head -5
# Expect: HTTP/1.1 200  and  Content-Type: application/javascript

curl -sI 'https://YOUR_HOST/icons/excalidraw.svg' | head -5
# Expect: 200, Content-Type: image/svg+xml (not 302 to oauth, not HTML)

curl -sI 'https://YOUR_HOST/api/health' | head -5
# Expect: 200 JSON from Node

curl -sI 'https://YOUR_HOST/api/files/tree' | head -5
# Expect: 200 or 401 — not 404 from a static-only upstream
```

**Symptom: many 404 on `/assets/*.js`, `/icons/*`, `/api/files/*`**

Usually **stale or partial release**: `index.html` was updated but `apps/web/build/assets/` was not copied atomically, or the running container/image predates routes like `GET /api/files/hashes`. Fix: run `./_scripts/deploy.sh ship` on the server (full `yarn build:production` + Docker replace). Host check before ship: `node scripts/verify-app-build.mjs`.

### Embed security (`/embed`)

- Access control lives in `server/lib/embedAccess.js` (domain context → token → allowlist).
- Set a stable `EMBED_SESSION_SECRET` in production (same value on all API instances).
- Outer nginx: prefer passing through app `Content-Security-Policy` `frame-ancestors` from the embed response; avoid overriding with global `frame-ancestors *` if tokens use domain allowlists.

### Browser caching (SPA + embed static)

Docker nginx (`deploy/full/nginx.conf`) mirrors the app cache split:

| Path | Policy |
|------|--------|
| `index.html`, `/build-meta.json` | `no-cache` — always revalidate shell |
| `/assets/*`, `/mind-map/dist/*` | `immutable` + 1y — content-hashed bundles |
| `/api/*`, `/embed` (HTML/API) | proxied to Node; document routes use `ETag` / `304` where applicable |

Content-hashed embed chunks (`/embed/assets`, `/embed/fonts`, `/embed/mind-map/dist/*`) are **public** (immutable cache). Vite `import()` / React `lazy()` cannot rely on HttpOnly session cookies. Embed **HTML**, **`/embed/api/:fileId/data`**, and **`/embed/mind-map/index.html`** remain token + domain gated (`embedAccess.js`).

After deploy, the SPA compares `VITE_APP_GIT_SHA` (injected at build) with `build-meta.json` and reloads once if they differ (stale tab after a new release).

### Performance verification (manual Network tab)

| Scenario | Expected after this release |
|----------|----------------------------|
| Main editor refresh (local cache, server unchanged) | `GET /api/files/:id` → **304**; no large JSON parse |
| MindMap refresh | Cache-first; background `GET /api/files/hashes` only; no second full `getFile` when hash matches |
| Embed reload | Hashed `/embed/.../dist/*` served with **session cookie** only (no per-chunk DB in server logs); second load hits **disk cache** |

Automated: `yarn vitest run server/lib/documentEtag.test.js server/lib/embedAccess.test.js scripts/mind-map-webpack-chunks.test.mjs`.

**MindMap build hygiene** (source, not hand-patched `public/mind-map/`):

- `native/web/vue.config.js`: `html.hash = false` (content-hash filenames only).
- `native/copy.js` + `scripts/mind-map-webpack-chunks.mjs`: strip stray `?buildHash` query strings and remove `<link rel="preload">` for `dist/*` (avoids credentials mismatch double-fetch).
- Host diagnostics: `ship` builds with minimal logging; `debug-ship` sets `VITE_APP_DEPLOY_DEBUG=true` (all `devDebug` channels + `POST /api/logs`). Production containers set `EXCALIDRAW_CLIENT_LOG=0`; debug containers set `=1`.
- Native AI push: `useMindMapNativeAIConfig` (single coordinator; do not duplicate in `MindMapEditorShell`).
