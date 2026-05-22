# P2-1 ExcalidrawAdapter

## 验证内容

验证 Excalidraw 是否已作为第一个 `DocumentFormatAdapter` 接入，同时不改变 `.excalidraw` 对外导出格式。

重点检查：

- 是否存在通用 `DocumentFormatAdapter` 接口。
- 是否存在 `ExcalidrawAdapter`。
- adapter 是否提供 `createEmpty`、`parse`、`serialize`、`migrate`、`validate`、`toDocument`。
- adapter 是否复用现有 Excalidraw 文件导入逻辑。
- registry 是否注册了 `ExcalidrawAdapter`。
- `packages/excalidraw/data/json.ts` 的 `.excalidraw` 导出格式是否保持原样。

## 如何验证

运行：

```bash
node experiments/p2-1-excalidraw-adapter/validate.mjs
```

脚本静态检查 `excalidraw-app/data/formats/*` 与 `packages/excalidraw/data/json.ts`。

## 结果

结论：`PASS`

已确认：

- `DocumentFormatAdapter` 接口已定义。
- `ExcalidrawAdapter` 已实现并注册到 registry。
- `createEmpty()` 返回 Excalidraw scene 形状。
- `parse()` 复用现有 `loadExcalidrawFileAsServerSceneData`，并支持 `normalizeDocument`。
- `.excalidraw` 对外序列化仍由原包逻辑维护，没有改成 managed document。

## 结论

阶段 4 的 adapter 模板已建立。后续 `MindMapAdapter` 可以按相同接口接入，但真实文件导入导出流程仍需在统一导入导出阶段逐步迁移到 registry。
