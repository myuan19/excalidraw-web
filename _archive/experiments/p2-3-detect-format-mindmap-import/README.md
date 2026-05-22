---
title: P2-3 detectFormat 与 MindMap 导入
created: 2026-05-08
updated: 2026-05-08
tags: [多格式, detectFormat, MindMap, 导入]
description: 验证统一格式识别模块和文件列表 MindMap 导入链路，确保普通 JSON 不被误判为 MindMap。
source: Cursor AI 对话，2026-05-08
---

# P2-3 detectFormat 与 MindMap 导入

## 结论

通过。阶段 7 的第一段切片已新增 `detectFormat(file)`，并让文件列表导入 `.smm` / MindMap JSON 后创建 `kind = "mindmap"` 文件。

## 验证方法

运行：

```bash
node experiments/p2-3-detect-format-mindmap-import/validate.mjs
```

脚本验证格式识别模块、MindMap 导入分支、Excalidraw 识别保留和普通 JSON 防误判。

## 范围

本实验只覆盖格式识别和 MindMap 导入。adapter 化导出、迁移体系和第三种格式验证仍属于后续待办。
