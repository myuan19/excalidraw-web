# P0-3 旧 .excalidraw 文件兼容

## 验证内容

验证引入 `ManagedDocument` 后，旧 `.excalidraw` 文件是否可以继续识别为 Excalidraw 文档。

重点检查：

- 没有 `kind/containerVersion/formatVersion` 的旧 scene 是否能推断为 `kind: "excalidraw"`。
- 旧 scene 的 `version` 是否能映射为 `formatVersion`。
- 现有服务端新建文件是否仍写出 legacy Excalidraw scene。
- 当前导入链路是否具备 legacy 修复能力。
- 本地缓存是否存在强 scene 结构假设。

## 如何验证

运行：

```bash
node experiments/p0-3-legacy-excalidraw-compat/validate.mjs
```

脚本构造 legacy scene 和 managed scene，验证推断逻辑，并静态检查 `server/routes/files.js`、`packages/excalidraw/data/blob.ts`、`app/data/forkFileTypes.ts`。

## 结果

结论：`PASS_WITH_LOCAL_CACHE_RISK`

已确认：

- 旧 scene 可以通过边界归一化推断为 Excalidraw 文档。
- 服务端当前仍默认创建 legacy scene。
- Excalidraw blob 导入链路对 legacy 数据有兼容处理。

风险：

- `forkFileTypes.ts` 的本地缓存解析当前要求存在 `elements`，多格式文档会被判定为不可识别。

## 结论

旧 `.excalidraw` 兼容可行，但正式切换到 `ManagedDocument` 前必须先改造本地缓存解析，让它支持 `kind` 文档壳，同时保留 legacy scene 兼容。
