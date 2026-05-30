#!/usr/bin/env bash
set -euo pipefail
export LANG="${LANG:-en_US.UTF-8}"
export PYTHONIOENCODING="${PYTHONIOENCODING:-utf-8}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
mkdir -p output

{
echo "=== 实验: 首页预览聚焦算法 ==="
echo ""

node experiment.mjs

echo ""
echo "=== 实验结束 ==="
} 2>&1 | tee output/run.log
