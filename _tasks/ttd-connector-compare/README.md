# TTD 连线后处理对比

样本：`sample.mermaid`

## 运行

```bash
bash _tasks/ttd-connector-compare/run.sh
```

## 三列对比

| 列 | 含义 |
|----|------|
| ① Git 原始 | 最后一次提交 `6ceb8fa0` 的 `common.ts`：仅 `convertToExcalidrawElements`，**无**后处理（保留 Mermaid 自带 `roundness`） |
| ② 直角参考 | 去掉 `roundness`，保留 Mermaid 原始折点走线 |
| ③ 当前工作区 | 共线简化 + 标准圆弧 fillet（自适应 4–7 采样） |

Git 原始逻辑见 `gitHeadPipeline.ts`（与 `git show HEAD:.../common.ts` 一致）。

对比图会去掉连线上的标签文字（如「否」「是」），避免遮挡拐角；节点内文字保留。

## 输出

- `compare-side-by-side.png` — 三列并排
- `git-head-connectors.png` / `sharp-connectors.png` / `current-connectors.png`
- `meta.json`
