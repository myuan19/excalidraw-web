#!/usr/bin/env bash
set -euo pipefail
export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-C.UTF-8}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== 实验: MindMap 预览文字规范化 ==="
node experiment.mjs
echo ""
echo "输出: before.svg / after.svg / preview.html / result.json"
echo "=== 实验结束 ==="
