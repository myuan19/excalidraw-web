# P0-5 多格式 hash 与 dirty 判断

## 验证内容

验证当前 hash/dirty 判断是否适用于 MindMap 等非 Excalidraw 文档。

重点检查：

- 当前 `hashSceneSnapshot` 是否只关注 `elements/appState/files`。
- 两个不同 MindMap 文档是否会得到不同 hash。
- Excalidraw 文件名变化是否仍能被忽略。
- `ServerSync.saveFileImmediate` 是否在保存事件中使用 document hash。

## 如何验证

运行：

```bash
node experiments/p0-5-multiformat-hash-dirty/validate.mjs
```

脚本复刻当前 `hashSceneSnapshot` 逻辑，对两个内容不同的 MindMap managed document 计算 hash，并静态检查源码中是否存在 `hashDocumentSnapshot` 以及 `ServerSync.saveFileImmediate` 是否已切到 document hash。

## 结果

结论：`PASS`

已确认：

- 当前 `hashSceneSnapshot` 仍会让两个不同 MindMap 文档得到相同 hash，因此它只适合 legacy Excalidraw scene。
- `hashDocumentSnapshot` 已存在，并能识别 managed MindMap 内容变化。
- Excalidraw `appState.name` 忽略语义保留。
- `ServerSync.saveFileImmediate` 发送保存事件时已改为使用 `hashDocumentSnapshot(data)`。

## 结论

阶段 1 的核心阻塞已解除：多格式保存事件边界现在有文档级 hash。现阶段仍保留 Excalidraw 编辑器内部的 scene hash，待 `ManagedDocument` 和 adapter 引入后再进一步收敛。
