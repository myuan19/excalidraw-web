# Drawing Space Shell (v0.3 新架构归档)

此目录保存 2026-05-21 从仓库根目录迁出的 **新架构实验代码**（`drawing-space-shell`：Vite + `src/` + Zustand）。

主开发线已恢复为根目录下的 **Excalidraw monorepo**（原 `_old` 快照 + git 基线）。

## 目录说明

| 路径 | 说明 |
|------|------|
| `src/` | React 应用（FilesPage、EditorRegistry、features/*） |
| `server/` | 新架构 Node API |
| `package.json` | `drawing-space-shell` 依赖与脚本 |
| `_docs/` | 新架构迁移文档 |

本地运行（仅供参考，需在此目录内 `yarn install`）：

```bash
cd _references/old2-drawing-space-shell
yarn install
yarn dev
```
