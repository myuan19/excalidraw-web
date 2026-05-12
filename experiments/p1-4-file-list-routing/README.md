# P1-4 文件列表多格式路由

## 验证内容

验证当前文件列表是否已经具备根据 `kind` 打开不同编辑器的能力。

重点检查：

- `ServerFile` 是否有 `kind` 字段。
- `onOpenFile` 是否携带或解析文档类型。
- 文件卡片点击是否根据 `kind` 分支。
- 新建入口是否支持选择格式。
- 导入入口是否包含 `.smm`。
- App 是否根据 URL hash 中的 `kind` 分支到不同编辑器。

## 如何验证

运行：

```bash
node experiments/p1-4-file-list-routing/validate.mjs
```

脚本静态检查 `server/db.js`、`server/routes/files.js`、`excalidraw-app/data/ServerSync.ts`、`excalidraw-app/components/FileList.tsx` 和 `excalidraw-app/App.tsx`。

## 结果

结论：`PASS_WITH_IMPORT_MVP_PENDING`

已确认：

- 服务端 `files` 表具备 `kind` 字段，默认值为 `excalidraw`。
- 列表、树和单文件 API 会返回 `kind`。
- `ServerFile` 类型包含 `kind?: string`。
- 文件卡片点击会传递 `{ id, kind }`。
- App 会把非 Excalidraw 文件编码为 `#file=<id>&kind=<kind>` 并进入占位编辑器分支。
- 新建文件仍默认创建 Excalidraw。
- 导入入口仍只支持 Excalidraw 相关文件。

## 结论

阶段 2 的核心阻塞已解除：文件 `kind` 已贯通服务端、文件列表和打开路由。导入 `.smm`、按格式新建 MindMap、以及真实 MindMap 编辑器仍属于后续 MindMap MVP 和统一导入导出阶段。
