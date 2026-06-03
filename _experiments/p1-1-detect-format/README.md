# P1-1 格式识别 detectFormat(file)

## 验证内容

验证统一导入入口能否根据文件名、MIME 和 JSON 内容识别不同格式。

覆盖样例：

- `.excalidraw`
- managed MindMap JSON
- `.smm`
- 普通 `.json`
- Markdown

## 如何验证

运行：

```bash
node experiments/p1-1-detect-format/validate.mjs
```

脚本实现一个最小 `detectFormat(file)`，优先读取 JSON 内部 `kind/type`，再回退到扩展名和 MIME。

## 结果

结论：`PASS`

已确认：

- `.excalidraw` 可识别为 `excalidraw`。
- `kind: "mindmap"` 可识别为 `mindmap`。
- `.smm` 且具备 `layout/root/theme/view` 形状时可识别为 `mindmap`。
- 普通 `.json` 不会被误识别。
- Markdown 可作为第三种格式候选。

## 结论

统一格式识别可行。正式实现时应优先使用 JSON 内部 `kind/type`，不要仅凭 `.json` 扩展名判断格式。
