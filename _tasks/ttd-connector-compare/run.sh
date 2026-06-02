#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TASK_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$TASK_DIR"
echo "=== 安装 Playwright（仅本目录）==="
npm install
npx playwright install chromium

echo "=== 浏览器渲染 + PNG（与 TTD 预览同路径）==="
cd "$TASK_DIR"
node render-compare.mjs

echo ""
echo "输出: $TASK_DIR/output/"
ls -la "$TASK_DIR/output/"
