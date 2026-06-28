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
  log "sync desktop app icon"
  (cd "$ROOT" && node apps/desktop/scripts/sync-app-icon.mjs)
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
  (cd "$ROOT" && node scripts/verify-desktop-entry.mjs)
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

ensure_pack_outputs_unlocked() {
  log "ensure desktop pack outputs are not locked"
  (cd "$ROOT" && node scripts/ensure-desktop-pack-unlocked.mjs)
}

is_debug_pack() {
  case "${EDITORHUB_DESKTOP_DEBUG_PACK:-}" in
    1|true|TRUE|yes|YES|on|ON) return 0 ;;
    *) return 1 ;;
  esac
}

desktop_dist_script() {
  if is_debug_pack; then
    printf '%s' "dist:debug"
  else
    printf '%s' "dist"
  fi
}

desktop_pack_script() {
  if is_debug_pack; then
    printf '%s' "pack:debug"
  else
    printf '%s' "pack"
  fi
}

write_desktop_build_flags() {
  log "write desktop build flags"
  (cd "$ROOT" && node apps/desktop/scripts/write-build-flags.mjs)
}

pack_desktop() {
  write_desktop_build_flags
  ensure_pack_outputs_unlocked
  (cd "$ROOT" && run_yarn --cwd apps/desktop run "$(desktop_dist_script)")
}

case "$TARGET" in
  all)
    if is_debug_pack; then
      export VITE_APP_DEPLOY_DEBUG=true
      log "build production artifacts (desktop debug pack)"
    else
      log "build production artifacts"
    fi
    (cd "$ROOT" && bash scripts/build-production.sh all)
    verify_build
    log "build Windows installer and portable app"
    prepare_runtime
    pack_desktop
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
    write_desktop_build_flags
    (cd "$ROOT" && run_yarn --cwd apps/desktop run "$(desktop_pack_script)")
    ;;
  dist|dist-debug)
    if [[ "$TARGET" == "dist-debug" ]]; then
      export EDITORHUB_DESKTOP_DEBUG_PACK=1
      export VITE_APP_DEPLOY_DEBUG=true
      log "build Web app (desktop debug pack)"
      (cd "$ROOT" && bash scripts/build-production.sh app)
    fi
    if is_debug_pack; then
      log "build Windows installer and portable app (debug pack)"
    else
      log "build Windows installer and portable app"
    fi
    verify_build
    prepare_runtime
    pack_desktop
    ;;
  *)
    cat >&2 <<'EOF'
Usage: scripts/build-desktop.sh [all|app|mindmap|verify|check|pack|dist|dist-debug]

Targets:
  all         build production Web + MindMap artifacts, then build Windows desktop packages
  app         build only the Web app artifacts
  mindmap     build and sync only the MindMap iframe artifacts
  verify      verify existing apps/web/build and desktop Electron/server modules
  check       run verify plus TypeScript typecheck
  pack        verify, then build an unpacked desktop app
  dist        verify, then build Windows installer + portable exe
  dist-debug  like dist, but bake debug diagnostics (also set EDITORHUB_DESKTOP_DEBUG_PACK=1)

Environment:
  EDITORHUB_DESKTOP_DEBUG_PACK=1   build a debug-enabled desktop package (Web + main process)
EOF
    exit 2
    ;;
esac
