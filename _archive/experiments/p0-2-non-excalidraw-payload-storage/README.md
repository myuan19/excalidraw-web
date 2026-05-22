# P0-2 当前文件系统保存非 Excalidraw payload

## 验证内容

验证当前服务端保存模型是否能保存非 Excalidraw scene 的 JSON 数据。

重点检查：

- 非 scene payload 能否写入 `current.excalidraw`。
- archive 快照能否保存同样的 payload。
- SHA-256 是否能基于任意 JSON 生成。
- payload 不包含 `elements/appState/files` 时是否仍能往返。

## 如何验证

运行：

```bash
node experiments/p0-2-non-excalidraw-payload-storage/validate.mjs
```

脚本模拟 `server/routes/files.js` 的关键写入语义：`JSON.stringify(req.body.data)`、当前文件写入、archive 写入和内容 hash 计算。实验数据保存在本目录的 `.tmp-data/`。

## 结果

结论：`PASS`

已确认：

- `{ kind: "mindmap", containerVersion, formatVersion, data }` 可以作为普通 JSON 写入。
- 当前文件和 archive 快照均可无损读取。
- hash 对任意 JSON 有效。
- 服务端核心写入路径不强制要求 `elements/appState/files`。

## 结论

服务端磁盘存储本身可以承载 MindMap 这类非 Excalidraw payload。后续改造重点不在底层文件写入，而在文件类型元信息、hash/dirty、列表路由和本地缓存。
