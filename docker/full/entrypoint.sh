#!/bin/sh
set -e

term() {
  for pid in $(jobs -p); do
    kill "$pid" 2>/dev/null || true
  done
}
trap term INT TERM

export EXCALIDRAW_DATA_DIR="${EXCALIDRAW_DATA_DIR:-/var/lib/excalidraw}"
export NODE_ENV="${NODE_ENV:-production}"
export PORT="${PORT:-3033}"
export LISTEN_HOST="${LISTEN_HOST:-127.0.0.1}"

mkdir -p "$EXCALIDRAW_DATA_DIR"

node /opt/excalidraw/server/index.js &
nginx -c /etc/nginx/nginx-excalidraw.conf -g "daemon off;" &

wait
term
