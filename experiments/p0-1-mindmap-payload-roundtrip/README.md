---
title: P0-1 MindMap 独立 payload 保存与恢复
created: 2026-05-08
updated: 2026-05-08
tags: [多格式, MindMap, 技术验证]
description: 验证 MindMap PoC 是否保留完整数据快照，并具备 getData(true) 与 setFullData 的往返边界。
source: Cursor AI 对话，2026-05-08
---

# P0-1 MindMap 独立 payload 保存与恢复

## 结论

通过。阶段 5 已在 `excalidraw-app/MindMapPoC.tsx` 中建立完整 MindMap 数据样例，并在浏览器组件边界调用 `getData(true)` 与 `setFullData`。

## 验证方法

运行：

```bash
node experiments/p0-1-mindmap-payload-roundtrip/validate.mjs
```

脚本静态验证 PoC 中存在完整数据结构、布局、主题，以及读写回放调用。浏览器运行能力由 P0-4 继续覆盖。

# P0-1 MindMap 独立 payload 保存与恢复

## 验证内容

验证 MindMap 是否可以作为独立 payload 保存，而不是转换成 Excalidraw `elements`。

重点检查：

- `simple-mind-map/index.js` 是否提供 `getData(true)` 完整快照。
- `setFullData` 是否能恢复 `root`、`layout`、`theme`、`view`。
- 代表性 MindMap JSON 是否可以无损序列化和反序列化。

## 如何验证

运行：

```bash
node experiments/p0-1-mindmap-payload-roundtrip/validate.mjs
```

脚本读取 `/root/projects/archive/mind-map/simple-mind-map/index.js` 和包版本，检查 `getData(true)` / `setFullData` 的 API 形状，并构造包含节点、布局、主题、视图、图片、备注、超链接的代表性 payload 做 JSON 往返。

## 结果

结论：`PARTIAL_PASS`

已确认：

- `getData(true)` 返回 `layout/root/theme/view`。
- `setFullData` 会恢复 `root/layout/theme/view`。
- 代表性 JSON payload 可无损往返。

未完成：

- 尚未在真实浏览器 DOM 中实例化 MindMap 并执行运行时往返。

## 结论

MindMap 作为独立 JSON payload 接入是可行方向。正式开发前仍需补一个浏览器运行时 PoC，确认真实 `getData(true)` 输出经过 `setFullData` 后视觉和交互状态一致。
