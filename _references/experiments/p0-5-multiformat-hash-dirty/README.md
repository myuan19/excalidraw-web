# P0-5 多格式 hash 与 dirty 判断

## 验证内容

验证当前 hash/dirty 判断是否适用于 MindMap 等非 Excalidraw 文档。

重点检查：

- 当前 `hashSceneSnapshot` 是否只关注 `elements/appState/files`。
- 两个不同 MindMap 文档是否会得到不同 hash。
- Excalidraw 文件名变化是否仍能被忽略。
- `ServerSync.saveFileImmediate` 是否在保存事件中使用 scene hash。

## 如何验证

运行：

```bash
node experiments/p0-5-multiformat-hash-dirty/validate.mjs
```

脚本复刻当前 `hashSceneSnapshot` 逻辑，并对两个内容不同的 MindMap managed document 计算 hash；同时计算一个候选 document-level stable hash 作为对照。

## 结果

结论：`FAIL_CURRENT_NEEDS_DOCUMENT_HASH`

已确认：

- 当前 `hashSceneSnapshot` 会让两个不同 MindMap 文档得到相同 hash。
- 候选 document-level hash 可以识别 MindMap 内容变化。
- 当前 hash 仍能忽略 Excalidraw `appState.name`，这是已有业务语义。
- `ServerSync.saveFileImmediate` 发送保存事件时仍调用 `hashSceneSnapshot(data)`。

## 结论

这是正式开发前必须先解决的阻塞项。多格式边界需要新增文档级 hash，例如包含 `kind/containerVersion/formatVersion/data` 的稳定序列化。Excalidraw 的 `appState.name` 忽略规则应下沉到 `ExcalidrawAdapter` 或 Excalidraw 专用 hash 逻辑中。
