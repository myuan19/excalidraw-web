#!/usr/bin/env bash
# 生产构建：MindMap iframe 静态资源 + 宿主 SPA（与 _scripts/dev.sh do_build 对齐）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="${ROOT}/apps/web"
MM_DIR="${WEB_DIR}/editors/mindmap/native"
MM_WEB="${MM_DIR}/web"
TARGET="${1:-all}"

log() { echo "[build-production] $*"; }

run_yarn() {
  if command -v yarn >/dev/null 2>&1; then
    yarn "$@"
  else
    corepack yarn "$@"
  fi
}

prepare_mindmap_web_deps() {
  if [[ ! -d "$MM_WEB" ]]; then
    echo "[build-production] ERROR: missing MindMap web source: $MM_WEB" >&2
    exit 1
  fi

  [[ -f "$MM_WEB/package.json" ]] || {
    echo "[build-production] ERROR: missing $MM_WEB/package.json" >&2
    exit 1
  }
  [[ -f "$MM_DIR/copy.js" ]] || {
    echo "[build-production] ERROR: missing $MM_DIR/copy.js" >&2
    exit 1
  }

  if [[ ! -d "$MM_WEB/node_modules" ]]; then
    log "npm install (mind-map/web)..."
    npm_install() {
      (cd "$MM_WEB" && NPM_CONFIG_REGISTRY="${1}" npm install --no-audit --no-fund)
    }
    registry="${NPM_CONFIG_REGISTRY:-https://registry.npmjs.org}"
    npm_install "$registry" \
      || { log "npm retry: registry.npmmirror.com"; npm_install "https://registry.npmmirror.com"; } \
      || { log "npm retry: registry.npmjs.org"; npm_install "https://registry.npmjs.org"; }
  fi

  if [[ ! -f "$MM_WEB/node_modules/babel-loader/lib/index.js" ]]; then
    log "install babel-loader..."
    (cd "$MM_WEB" && npm install 'babel-loader@^8' --no-audit --no-fund) || true
  fi

  local symlink_target="$MM_WEB/node_modules/simple-mind-map"
  if [[ ! -e "$symlink_target" ]]; then
    log "link simple-mind-map → node_modules/simple-mind-map"
    ln -sf "$MM_DIR/simple-mind-map" "$symlink_target"
  fi

  rm -rf "$MM_WEB/node_modules/.cache" 2>/dev/null || true
}

build_mindmap() {
  prepare_mindmap_web_deps
  log "MindMap native/web build + sync public/mind-map/"
  (
    cd "$MM_WEB"
    npm run build
    node ../copy.js
  )
  log "mind-map ready"
  node "${ROOT}/scripts/normalize-mind-map-index.mjs"
  node "${ROOT}/scripts/verify-mind-map-public.mjs"
}

verify_mindmap_in_app_build() {
  local app_mm="${WEB_DIR}/build/mind-map"
  if [[ ! -f "${app_mm}/index.html" ]]; then
    log "ERROR: missing apps/web/build/mind-map/index.html — Vite did not copy public/mind-map/"
    exit 1
  fi
  log "verify apps/web/build/mind-map/"
  node "${ROOT}/scripts/verify-mind-map-public.mjs" --root apps/web/build/mind-map
}

run_app_build() {
  local mode="${1:-default}"
  node "${ROOT}/scripts/verify-mind-map-public.mjs"
  case "$mode" in
    docker)
      log "app vite build (docker)"
      (cd "$WEB_DIR" && run_yarn build:app:docker)
      ;;
    *)
      log "app vite build"
      (cd "$WEB_DIR" && run_yarn build:app-only && run_yarn build:version)
      ;;
  esac
  verify_mindmap_in_app_build
}

case "$TARGET" in
  mindmap)
    build_mindmap
    ;;
  app)
    run_app_build default
    ;;
  all)
    build_mindmap
    run_app_build default
    ;;
  docker)
    build_mindmap
    run_app_build docker
    ;;
  *)
    echo "usage: $0 [mindmap|app|all|docker]" >&2
    exit 1
    ;;
esac

log "done ($TARGET)"
