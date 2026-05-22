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
