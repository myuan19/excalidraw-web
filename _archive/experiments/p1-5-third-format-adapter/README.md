# P1-5 第三种格式 adapter

## 验证内容

验证 `DocumentFormatAdapter` 抽象是否能支持 MindMap 和 Excalidraw 之外的第三种格式。

本实验选择 Markdown 作为极简格式。

## 如何验证

运行：

```bash
node experiments/p1-5-third-format-adapter/validate.mjs
```

脚本实现一个最小 `MarkdownAdapter`，包含：

- `kind`
- `currentFormatVersion`
- `extensions`
- `mimeTypes`
- `createEmpty`
- `parse`
- `serialize`
- `migrate`
- `validate`

## 结果

结论：`PASS`

已确认：

- Markdown adapter 可以注册到 registry。
- 空文档、解析结果和序列化结果都能通过验证。
- Markdown 可以被包装成 `ManagedDocument`。

## 结论

adapter 抽象没有明显绑定 Excalidraw 或 MindMap。后续接入第三种简单格式时，核心保存、打开、迁移链路理论上不需要大改。
