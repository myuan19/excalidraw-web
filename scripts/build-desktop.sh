#!/usr/bin/env bash
# Desktop build helper: reuse the Web production build, then verify desktop prerequisites.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-all}"

log() { printf '[build-desktop] %s\n' "$*"; }
fail() {
  printf '[build-desktop] ERROR: %s\n' "$*" >&2
  exit 1
}

run_yarn() {
  if command -v yarn >/dev/null 2>&1; then
    yarn "$@"
  else
    corepack yarn "$@"
  fi
}

prepare_runtime() {
  local runtime_dir="${ROOT}/apps/desktop/.runtime"
  log "prepare Electron runtime files"
  rm -rf "$runtime_dir"
  mkdir -p "$runtime_dir"
  cp -R "${ROOT}/server" "${runtime_dir}/server"
  cp -R "${ROOT}/lib" "${runtime_dir}/lib"
  rm -rf "${runtime_dir}/server/node_modules"
  rm -rf "${runtime_dir}/server/data"
  rm -f "${runtime_dir}/server/package-lock.json"
}

verify_desktop_entry() {
  log "verify desktop Electron/server modules"
  (
    cd "$ROOT"
    node --input-type=module - <<'NODE'
await import("./apps/desktop/src/config.mjs");
await import("./apps/desktop/src/bootstrapServer.mjs");
NODE
  )
  [[ -f "${ROOT}/apps/desktop/electron/main.mjs" ]] || fail "missing apps/desktop/electron/main.mjs"
  [[ -f "${ROOT}/apps/desktop/electron/preload.mjs" ]] || fail "missing apps/desktop/electron/preload.mjs"
}

verify_build() {
  local web_build="${ROOT}/apps/web/build"
  [[ -f "${web_build}/index.html" ]] || fail "missing apps/web/build/index.html"
  [[ -f "${web_build}/mind-map/index.html" ]] || fail "missing apps/web/build/mind-map/index.html"
  [[ -d "${web_build}/mind-map/dist" ]] || fail "missing apps/web/build/mind-map/dist"

  log "verify apps/web/build"
  (cd "$ROOT" && node scripts/verify-app-build.mjs --root apps/web/build)

  log "verify apps/web/build/mind-map"
  (cd "$ROOT" && node scripts/verify-mind-map-public.mjs --root apps/web/build/mind-map)

  verify_desktop_entry
  log "desktop build prerequisites ok"
}

case "$TARGET" in
  all)
    log "build production artifacts"
    (cd "$ROOT" && bash scripts/build-production.sh all)
    verify_build
    log "build Windows installer and portable app"
    prepare_runtime
    (cd "$ROOT" && run_yarn --cwd apps/desktop run dist)
    ;;
  app)
    log "build Web app artifacts"
    (cd "$ROOT" && bash scripts/build-production.sh app)
    ;;
  mindmap)
    log "build MindMap iframe artifacts"
    (cd "$ROOT" && bash scripts/build-production.sh mindmap)
    ;;
  verify)
    verify_build
    ;;
  check)
    verify_build
    log "run typecheck"
    (cd "$ROOT" && run_yarn test:typecheck)
    ;;
  pack)
    verify_build
    log "build unpacked desktop app"
    prepare_runtime
    (cd "$ROOT" && run_yarn --cwd apps/desktop run pack)
    ;;
  dist)
    verify_build
    log "build Windows installer and portable app"
    prepare_runtime
    (cd "$ROOT" && run_yarn --cwd apps/desktop run dist)
    ;;
  *)
    cat >&2 <<'EOF'
Usage: scripts/build-desktop.sh [all|app|mindmap|verify|check|pack|dist]

Targets:
  all      build production Web + MindMap artifacts, then build Windows desktop packages
  app      build only the Web app artifacts
  mindmap  build and sync only the MindMap iframe artifacts
  verify   verify existing apps/web/build and desktop Electron/server modules
  check    run verify plus TypeScript typecheck
  pack     verify, then build an unpacked desktop app
  dist     verify, then build Windows installer + portable exe
EOF
    exit 2
    ;;
esac
