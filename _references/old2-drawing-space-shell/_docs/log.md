---
title: 变更日志
created: 2026-05-20
updated: 2026-05-20
---

# 变更日志

## 2026-05-20

- 用户可见层：设置页新增「帮助」「更新日志」与增强「关于」；根目录 `CHANGELOG.md`；版本与文案统一至 v0.3.0（`src/config/product.ts`）
- 迁移 v0.2.4 批次：补 MindMap native 保存落盘与保存状态回传、Embed token GET 同源校验、前端日志上报、素材库 groups payload 与本地 mirror 回退；同步 `新架构旧版能力填充映射.md`、`旧版功能全量迁移剩余遗漏.md`、`旧版功能全量迁移矩阵.md` 到当前状态
- 新增 `新架构旧版能力填充映射.md`：梳理当前新架构槽位、旧版能力清单、迁移落点、执行顺序和完成判定，作为后续完整迁移的架构地图
- 迁移 v0.2.3 批次：抽出 `openFileSync` 同步决策层并补测试；补编辑器 Ctrl/⌘+S 和同步状态提示；迁入 MindMap browser view storage 与完整 clipboard read 内容回传；新增 AI runtime、OpenAI-compatible stream、TTD persistence；新增 CombinedLibraryAdapter MVP、library sync queue，并接入 Excalidraw 素材库初始加载、变更保存、MainMenu、WelcomeScreen、Footer、TTD 入口
- 继续推进未完成迁移项：新增 Vitest 与 `FileSyncState` 单元测试，补 `DeltaStorage`、`LocalData`、browser scene 本地持久层，接入 Excalidraw 本地恢复链路
- 补编辑器体验收口：侧边栏离开编辑器草稿保护、浮动工具栏文件/历史/嵌入/AI 入口、MindMap hostOpen* 宿主事件、设置页素材库入口
- 推进 `新架构全量迁移待办总览.md` 的 P0 同步/草稿闭环：接线 server hash、草稿冲突提示、保存队列、pending draft flush 和服务端保存乐观锁
- 推进 P0 缩略图与文档格式：新增列表级缩略图预取、服务端缩略图内存缓存、草稿缩略图生成，并统一保存/导入的 `ManagedDocument` 包装
- 推进 P0 后端核心兼容：增强 `files/move` 校验、archives 列表上限与文件存在校验，并加入 HTTP trace 结构化日志
- 推进 P1 文件管理收口：新增移动端文件夹抽屉、搜索命中高亮和批量导入进度提示
- 推进 P1 历史版本收口：保存后历史列表失效刷新、恢复前未保存草稿确认、恢复后清理草稿缩略图和重置 hash
- 创建 `新架构全量迁移待办总览.md`：归并旧版迁移矩阵、剩余遗漏、本轮 UI/Embed/React 规范检查结论，作为后续全量迁移待办入口
- 初始化文档库：创建 `structure.md`、`log.md`
- `structure.md` 定义 `version` 自定义字段约定
