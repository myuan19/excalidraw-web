---
title: P2-2 MindMapAdapter MVP
created: 2026-05-08
updated: 2026-05-08
tags: [多格式, MindMap, adapter, MVP]
description: 验证 MindMap 是否作为第二种文档格式接入 adapter registry，并完成创建、打开、保存和导出 MVP。
source: Cursor AI 对话，2026-05-08
---

# P2-2 MindMapAdapter MVP

## 结论

通过。阶段 6 已新增 `MindMapAdapter`，并通过正式 `MindMapEditorShell` 接入创建、打开、手动保存、dirty hash 和 `.smm` 导出。

## 验证方法

运行：

```bash
node experiments/p2-2-mindmap-adapter-mvp/validate.mjs
```

脚本静态验证 adapter 注册、`kind=mindmap` 路由、新建 MindMap 文件、服务端保存、dirty hash 和导出入口。

## 范围

本阶段仅覆盖 MVP 闭环。自动保存、MindMap 缩略图、导入识别、外部附件上传和更完整的编辑工具栏后置到后续阶段。
