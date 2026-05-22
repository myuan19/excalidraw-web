#!/bin/sh
set -e

term() {
  for pid in $(jobs -p); do
    kill "$pid" 2>/dev/null || true
  done
}
trap term INT TERM

export EXCALIDRAW_CLIENT_LOG="${EXCALIDRAW_CLIENT_LOG:-1}"
export EXCALIDRAW_HTTP_TRACE="${EXCALIDRAW_HTTP_TRACE:-1}"
export EXCALIDRAW_THUMB_AUDIT_LOG="${EXCALIDRAW_THUMB_AUDIT_LOG:-1}"
export NODE_ENV="${NODE_ENV:-production}"
export PORT="${PORT:-3033}"
export LISTEN_HOST="${LISTEN_HOST:-127.0.0.1}"

mkdir -p "$EXCALIDRAW_DATA_DIR"

node /opt/excalidraw/server/index.js &
nginx -c /etc/nginx/nginx-excalidraw.conf -g "daemon off;" &

wait
term
