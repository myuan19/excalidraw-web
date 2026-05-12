# P1-4 文件列表多格式路由

## 验证内容

验证当前文件列表是否已经具备根据 `kind` 打开不同编辑器的能力。

重点检查：

- `ServerFile` 是否有 `kind` 字段。
- `onOpenFile` 是否携带或解析文档类型。
- 文件卡片点击是否根据 `kind` 分支。
- 新建入口是否支持选择格式。
- 导入入口是否包含 `.smm`。

## 如何验证

运行：

```bash
node experiments/p1-4-file-list-routing/validate.mjs
```

脚本静态检查 `excalidraw-app/components/FileList.tsx` 和 `excalidraw-app/data/ServerSync.ts`。

## 结果

结论：`FAIL_CURRENT_NEEDS_KIND_ROUTING`

已确认：

- `ServerFile.data` 允许 `unknown`，但 `ServerFile` 没有显式 `kind`。
- `onOpenFile` 只接收 `id`。
- 文件卡片点击直接 `onOpenFile(f.id)`，没有按 `kind` 分支。
- 新建入口默认创建 Excalidraw 文件。
- 导入 accept 不包含 `.smm`。

## 结论

这是 MindMap MVP 前必须改造的阻塞项。需要让服务端文件记录或返回数据带上 `kind`，文件列表按 `kind` 展示图标、筛选和创建入口，打开文件时路由到 Excalidraw editor 或 MindMap editor。
