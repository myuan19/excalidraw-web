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

mkdir -p "$EXCALIDRAW_DATA_DIR" "$EXCALIDRAW_DATA_DIR/logs"

export EXCALIDRAW_LOG_TO_FILE="${EXCALIDRAW_LOG_TO_FILE:-1}"

node /opt/excalidraw/server/index.js &
NODE_PID=$!

# Do not serve SPA-only nginx if API never came up (avoids /api/* returning index.html).
i=0
while [ "$i" -lt 30 ]; do
  if wget -q -O- "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$NODE_PID" 2>/dev/null; then
    echo "[entrypoint] Node API exited before /api/health was ready" >&2
    exit 1
  fi
  i=$((i + 1))
  sleep 1
done
if ! wget -q -O- "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
  echo "[entrypoint] Node API did not become ready on :${PORT}" >&2
  exit 1
fi

nginx -c /etc/nginx/nginx-excalidraw.conf -g "daemon off;" &

wait
term
