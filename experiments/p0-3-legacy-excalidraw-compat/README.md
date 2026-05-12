# P0-3 旧 .excalidraw 文件兼容

## 验证内容

验证引入 `ManagedDocument` 后，旧 `.excalidraw` 文件和现有本地缓存是否仍能被识别。

重点检查：

- 是否存在 `ManagedDocument` 类型。
- 是否存在 `normalizeDocument(raw)`。
- legacy Excalidraw scene 是否会被包装为 `kind: "excalidraw"`。
- 本地缓存解析是否通过 `normalizeDocument`，不再只接受顶层 `elements`。
- 服务端新建文件是否仍写出 legacy Excalidraw scene。
- Excalidraw blob 导入链路是否仍保留 legacy 修复。

## 如何验证

运行：

```bash
node experiments/p0-3-legacy-excalidraw-compat/validate.mjs
```

脚本静态检查 `excalidraw-app/data/documentTypes.ts`、`excalidraw-app/data/forkFileTypes.ts`、`server/routes/files.js` 和 `packages/excalidraw/data/blob.ts`。

## 结果

结论：`PASS`

已确认：

- `ManagedDocument` 与 `normalizeDocument` 已存在。
- legacy Excalidraw scene 会归一化为 `kind: "excalidraw"`。
- 本地缓存解析已改为通过 `normalizeDocument` 识别 Excalidraw payload。
- 本地缓存不再因为缺少顶层 `elements` 直接拒绝。
- 服务端默认新建文件仍是 legacy `.excalidraw` scene。

## 结论

阶段 3 的兼容风险已解除。现在可以在后续阶段逐步引入 adapter，而不会立刻破坏旧 `.excalidraw` 文件和现有白板本地缓存。

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

脚本构造 legacy scene 和 managed scene，验证推断逻辑，并静态检查 `server/routes/files.js`、`packages/excalidraw/data/blob.ts`、`excalidraw-app/data/forkFileTypes.ts`。

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
