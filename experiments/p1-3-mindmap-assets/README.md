---
title: P1-3 MindMap 图片与附件存储
created: 2026-05-08
updated: 2026-05-08
tags: [多格式, MindMap, 图片, 附件]
description: 验证 MindMap MVP 是否可以先通过 inline/base64 风格图片字段保留节点资产。
source: Cursor AI 对话，2026-05-08
---

# P1-3 MindMap 图片与附件存储

## 结论

通过但范围受限。阶段 5 PoC 已验证 MindMap 数据可以携带 inline 图片字段并参与完整快照回放；外部上传、资产去重和文件级附件存储留到 MindMapAdapter MVP 或后续资产系统阶段。

## 验证方法

运行：

```bash
node experiments/p1-3-mindmap-assets/validate.mjs
```

脚本验证 `MindMapPoC` 的节点数据模型包含 `image` 字段，样例使用 inline data URL，并通过 `getData(true)` / `setFullData` 参与完整数据回放。

# P1-3 MindMap 图片与附件存储

## 验证内容

验证 MindMap 节点中的图片、备注、超链接等附加内容是否能作为 JSON payload 的一部分保存。

重点检查：

- MindMap 源码是否处理 `image` 字段。
- 是否存在 base64 图片相关插件。
- `note`、`hyperlink` 等节点字段是否被源码使用。
- JSON 导出是否基于 `getData` 序列化。

## 如何验证

运行：

```bash
node experiments/p1-3-mindmap-assets/validate.mjs
```

脚本静态检查 `/root/projects/archive/mind-map/simple-mind-map` 中的节点渲染、base64 图片插件和导出插件，并构造带 inline image 的 JSON 样本做序列化往返。

## 结果

结论：`PARTIAL_PASS`

已确认：

- 源码中存在 `NodeBase64ImageStorage`。
- 节点渲染相关代码使用 `image`、`note`、`hyperlink`。
- 导出插件存在 JSON 序列化路径。
- inline base64 图片在 JSON 往返中不会丢失。

未完成：

- 尚未验证真实浏览器中远程图片、上传图片和导出渲染。

## 结论

MindMap MVP 可以先要求图片以内联 base64 或稳定 URL 的方式保存在 payload 中。如果后续需要类似 Excalidraw 的二进制附件管理，应为 MindMap adapter 增加格式级 `files` 映射。
