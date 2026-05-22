#!/usr/bin/env bash
set -euo pipefail
export LANG="${LANG:-en_US.UTF-8}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
mkdir -p output

{
echo "=== 实验: P1-9 MindMap 原生预览图 ==="
echo ""

node experiment.mjs

echo ""
echo "=== 实验结束 ==="
} 2>&1 | tee output/run.log
