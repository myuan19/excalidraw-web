#!/usr/bin/env bash
# 生产构建：MindMap iframe 静态资源 + 宿主 SPA（与 _scripts/dev.sh do_build 对齐）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MM_DIR="${ROOT}/app/editors/mindmap/native"
MM_WEB="${MM_DIR}/web"
TARGET="${1:-all}"

log() { echo "[build-production] $*"; }

prepare_mindmap_web_deps() {
  if [[ ! -d "$MM_WEB" ]]; then
    log "skip: mind-map/web missing"
    return 1
  fi

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
  prepare_mindmap_web_deps || return 0
  log "vue-cli-service build + sync public/mind-map/"
  (
    cd "$MM_WEB"
    NODE_OPTIONS=--openssl-legacy-provider npx vue-cli-service build
    node ../copy.js
  )
  log "mind-map ready"
  node "${ROOT}/scripts/verify-mind-map-public.mjs"
}

verify_mindmap_in_app_build() {
  local app_mm="${ROOT}/app/build/mind-map"
  if [[ ! -f "${app_mm}/index.html" ]]; then
    log "ERROR: missing app/build/mind-map/index.html — Vite did not copy public/mind-map/"
    exit 1
  fi
  log "verify app/build/mind-map/"
  node "${ROOT}/scripts/verify-mind-map-public.mjs" --root app/build/mind-map
}

run_app_build() {
  local mode="${1:-default}"
  node "${ROOT}/scripts/verify-mind-map-public.mjs"
  case "$mode" in
    docker)
      log "app vite build (docker)"
      (cd "$ROOT/app" && yarn build:app:docker)
      ;;
    *)
      log "app vite build"
      (cd "$ROOT/app" && yarn build:app-only && yarn build:version)
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
