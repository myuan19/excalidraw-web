#!/usr/bin/env bash
# simple-mind-map Web 应用启停脚本
# 支持 dev（Vue CLI dev server）和 prod（构建 + serve）两种模式
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_DIR="$PROJECT_ROOT/web"
PID_FILE="$SCRIPT_DIR/.pid"
LOG_FILE="$SCRIPT_DIR/server.log"
HOST_PORT="${MINDMAP_PORT:-28080}"

log_info()  { echo "[INFO] $*"; }
log_ok()    { echo "[ OK ] $*"; }
log_warn()  { echo "[WARN] $*"; }
log_error() { echo "[ERROR] $*" >&2; }

is_running() {
  [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

ensure_web_deps() {
  # babel-loader 必须在 web/node_modules 下物理存在；devDependencies 在 production install 会跳过，故已把 babel-loader 放在 dependencies
  if [[ ! -d "$WEB_DIR/node_modules" ]] || [[ ! -f "$WEB_DIR/node_modules/babel-loader/lib/index.js" ]]; then
    log_info "未检测到完整 web/node_modules 或缺 babel-loader，正在: (cd web && npm install) ..."
    (cd "$WEB_DIR" && npm install --no-audit --no-fund)
  fi
  if [[ ! -f "$WEB_DIR/node_modules/babel-loader/lib/index.js" ]]; then
    log_warn "babel-loader 仍未就绪，仅补装 babel-loader（勿使用 npm install --omit=dev 装前端）"
    (cd "$WEB_DIR" && npm install 'babel-loader@^8' --no-audit --no-fund) || true
  fi
  if [[ -f "$WEB_DIR/node_modules/babel-loader/lib/index.js" ]]; then
    rm -rf "$WEB_DIR/node_modules/.cache" 2>/dev/null || true
  else
    log_error "仍缺少 $WEB_DIR/node_modules/babel-loader/lib/index.js，请在本机执行: cd $WEB_DIR && rm -rf node_modules && npm install"
    return 1
  fi
}

ensure_symlink() {
  local target="$WEB_DIR/node_modules/simple-mind-map"
  if [[ ! -e "$target" ]]; then
    log_info "创建 simple-mind-map 软链接..."
    mkdir -p "$(dirname "$target")"
    ln -s "$PROJECT_ROOT/simple-mind-map" "$target"
  fi
}

cmd_dev() {
  if is_running; then
    log_warn "已有进程在运行 (PID: $(cat "$PID_FILE"))"
    return 0
  fi

  ensure_web_deps
  ensure_symlink
  # 清掉可能含错误绝对路径的 loader 缓存
  rm -rf "$WEB_DIR/node_modules/.cache" 2>/dev/null || true
  log_info "启动 Vue dev server（端口 $HOST_PORT）..."
  cd "$WEB_DIR"
  PORT="$HOST_PORT" nohup npx vue-cli-service serve --port "$HOST_PORT" > "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  log_ok "Dev server 已启动 (PID: $(cat "$PID_FILE"))"
  echo "       访问: http://localhost:${HOST_PORT}"
  echo "       日志: $LOG_FILE"
}

cmd_install() {
  log_info "安装 web 依赖 (npm install)..."
  (cd "$WEB_DIR" && npm install)
  ensure_symlink
  log_ok "依赖已安装: $WEB_DIR/node_modules"
}

cmd_build() {
  log_info "构建生产版本..."
  ensure_web_deps
  ensure_symlink
  cd "$WEB_DIR"
  npm run build
  log_ok "构建完成 → $PROJECT_ROOT/dist/"
}

cmd_start() {
  if is_running; then
    log_warn "已有进程在运行 (PID: $(cat "$PID_FILE"))"
    return 0
  fi

  if [[ ! -d "$PROJECT_ROOT/dist" ]]; then
    log_info "未找到 dist/，先执行构建"
    cmd_build
  fi

  log_info "启动静态文件服务（端口 $HOST_PORT）..."
  cd "$PROJECT_ROOT"
  nohup npx http-server dist -p "$HOST_PORT" -c-1 --cors > "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  log_ok "静态服务已启动 (PID: $(cat "$PID_FILE"))"
  echo "       访问: http://localhost:${HOST_PORT}"
  echo "       日志: $LOG_FILE"
}

cmd_stop() {
  if ! is_running; then
    log_warn "没有正在运行的进程"
    rm -f "$PID_FILE"
    return 0
  fi

  local pid
  pid="$(cat "$PID_FILE")"
  log_info "停止进程 (PID: $pid)..."
  kill "$pid" 2>/dev/null || true
  sleep 1
  kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
  rm -f "$PID_FILE"
  log_ok "已停止"
}

cmd_restart() {
  cmd_stop
  cmd_dev
}

cmd_logs() {
  if [[ -f "$LOG_FILE" ]]; then
    tail -f "$LOG_FILE"
  else
    log_error "日志文件不存在: $LOG_FILE"
    exit 1
  fi
}

cmd_status() {
  echo "项目目录: $PROJECT_ROOT"
  echo "Web 目录: $WEB_DIR"
  echo "端口:     $HOST_PORT"
  if is_running; then
    echo "状态:     运行中 (PID: $(cat "$PID_FILE"))"
  else
    echo "状态:     未运行"
  fi
}

usage() {
  cat <<EOF
Simple Mind Map Web 应用

用法: $0 <命令>

命令:
  install   在 web/ 下执行 npm install（修复 babel-loader 等依赖缺失时可用）
  dev       启动 Vue CLI dev server（热更新，开发用）
  build     构建生产版本
  start     启动生产版本静态服务（自动构建如果需要）
  stop      停止服务
  restart   重启（stop + dev）
  logs      跟踪日志（Ctrl+C 退出）
  status    查看状态

环境变量:
  MINDMAP_PORT   端口（默认: ${HOST_PORT}）

示例:
  $0 dev
  $0 stop
  MINDMAP_PORT=9090 $0 dev
EOF
}

case "${1:-}" in
  install) cmd_install ;;
  dev)     cmd_dev ;;
  build)   cmd_build ;;
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_restart ;;
  logs)    cmd_logs ;;
  status)  cmd_status ;;
  -h|--help|help) usage; exit 0 ;;
  "") usage; exit 1 ;;
  *) log_error "未知命令: $1"; usage >&2; exit 1 ;;
esac
