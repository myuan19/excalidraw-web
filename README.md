# EditorHub

Self-hosted multi-editor hub: file list, Excalidraw canvas, MindMap editor, embed sharing.

## Repository layout

### Product code（日常开发）

```text
app/          Host application — routing, sync, file list, editor shells (app/editors/)
server/       Express API + SQLite + on-disk JSON
packages/     @excalidraw/* editor libraries (canvas engine)
public/       Static assets served by Vite (MindMap iframe → public/mind-map/)
lib/          Shared logger core (app/lib + server/lib are thin adapters)
```

### Tooling & deploy

```text
scripts/      Monorepo build/release scripts (packages, locales, release)
deploy/       Dockerfiles, compose, nginx, legacy Vercel config
tests/        Vitest global setup
patches/      yarn patch-package overrides (must stay at repo root)
```

### Reference & local-only（不参与构建）

```text
_references/  Archived experiments, old v0.3 shell, upstream docs (reference only)
_dev_data/    Local dev persistence only (SQLite + files; gitignored, not in Docker)
_scripts/     Local dev/deploy helpers (gitignored)
_logs/        Local runtime logs (gitignored)
```

### Root config files（工具链要求，必须留在根目录）

Yarn workspaces、TypeScript、ESLint、Vitest、Prettier、Husky 等只能从仓库根读取，**不能**下沉到子目录。

| 文件 | 用途 |
| --- | --- |
| `package.json` / `yarn.lock` | Workspace 根与依赖锁 |
| `tsconfig.json` | 全仓 TypeScript 基线 |
| `vitest.config.mts` | 单元测试 |
| `.eslintrc.json` / `.eslintignore` | Lint |
| `.env.development` / `.env.production` | Vite 环境变量（app 通过 `envDir: ".."` 读取） |
| `.lintstagedrc.js` / `.husky/` | Git hooks |
| `.github/` | CI |
| `LICENSE` / `README.md` / `CLAUDE.md` | 文档 |

## Local data directory（`_dev_data/`，与源码分离）

本地开发数据放在仓库根目录 **`_dev_data/`**（单独目录，不混在 `app/`/`server/` 源码树里）：

| 场景 | 路径 |
| --- | --- |
| **本地开发（默认）** | `<repo>/_dev_data/` |
| **自定义** | `.env.development.local` 中 `EXCALIDRAW_DATA_DIR`（相对路径相对仓库根） |
| **Docker 部署** | 宿主机 `/opt/editorhub-web/data` → 容器 `/var/lib/excalidraw` |

```text
_dev_data/
├── excalidraw.db
├── files/<id>/
└── logs/                # 服务端 + 浏览器 ingest 日志（自动轮转）
    ├── server-<session>.log
    ├── client-<session>.log
    └── merged-<session>.log
```

- **Git**：`_dev_data/*` 已 gitignore（仅保留 `.gitkeep` 占位）
- **Docker / 生产构建**：`.dockerignore` 排除 `_dev_data`，不会打进镜像
- **实现**：`server/config/dataDir.js` + `server/loadEnv.mjs`；`./_scripts/dev.sh` 启动 API 时注入 `EXCALIDRAW_DATA_DIR`
- **日志**：统一写入 `_dev_data/logs/`（每次启动独立 session 文件；单文件超 `10M` 拆分为 `.1`、`.2`…，保留 14 份 / 总量 200M 自动清理）；浏览器日志经 `/api/logs` 进入 `client-*.log`，跨端排查优先看 `merged-*.log`

若存在旧目录 `server/data/`、`~/.local/share/excalidraw-web/` 或 `~/.local/share/editorhub-web/`，首次启动会自动迁移到 `_dev_data/`。

## Debug logs

Debug 日志有两层开关：

1. 后端启动时允许 Debug：部署脚本菜单 `2) debug-ship`，或 `DEPLOY_DEBUG=1 ./_scripts/deploy.sh ship`。
2. 前端运行时开启 Debug：设置面板里的 **Debug 日志**，或连续点击右下角版本号 5 次；开启后版本号旁显示 `Debug`。

部署脚本菜单 `1) ship` 不带 Debug，前端不会显示 Debug 入口，也不会采集前端 Debug 日志。

开启后，前端会输出更详细日志并转发到后端。日志格式为固定列：

```text
time | LEVEL | FE/BE | source | run/trace/tab/request | event - message | fields
```

常用查询：

```bash
yarn dlog --event save.queue
yarn dlog --event doc.version --file 66a58376
yarn dlog --trace trace-xxx --json
yarn dlog --list
```

最近列表动态刷新（编辑器内点击“最近”）：

```bash
yarn dlog --event recent.flyout
yarn dlog --event recent.flyout.live_refresh
yarn dlog --event recent.flyout --file 66a58376
yarn dlog --event recent.flyout --json
```

浏览器标签标题（排查“无标题/未命名”被谁覆盖）：

```bash
yarn dlog --event branding.title
yarn dlog --event branding.title.apply
yarn dlog --event branding.title.restore
yarn dlog --event branding.title --json
```

敏感字段（如 token、password、secret、apiKey）会自动脱敏，超长字段会截断。

## Quick start

```bash
yarn install
./_scripts/dev.sh --all    # API :3033 + MindMap + Vite
```

Production build:

```bash
yarn build
yarn docker:full              # deploy/docker-compose.full.yml
```

## Commands

| Command | Description |
| --- | --- |
| `yarn start` | Vite dev server (app/) |
| `yarn build` | Production frontend build |
| `yarn test:typecheck` | TypeScript check |
| `yarn test:app` | Vitest unit tests |
| `yarn dlog --event save.queue` | Query latest merged debug log |
| `yarn docker:full` | Full-stack Docker compose |
| `./_scripts/deploy.sh ship` | Build + Docker deploy |
| `DEPLOY_DEBUG=1 ./_scripts/deploy.sh ship` | Debug deploy (verbose logs, still only :17888) |

## License

MIT — based on [Excalidraw](https://excalidraw.com). Upstream marketing docs and examples are under `_references/upstream/`.
