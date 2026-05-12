# P1-2 最小迁移 registry

## 验证内容

验证格式级 migration registry 是否能按版本逐步迁移 MindMap 数据。

重点检查：

- 从旧版数据逐级迁移到当前版本。
- migration 能补齐 `layout/theme/view`。
- 缺少 migration 时能明确失败。

## 如何验证

运行：

```bash
node experiments/p1-2-migration-registry/validate.mjs
```

脚本定义 `CURRENT_VERSION = 3`，并提供 `1 -> 2`、`2 -> 3` 两个 migration，模拟旧 MindMap 数据升级。

## 结果

结论：`PASS`

已确认：

- 旧数据可以迁移到当前版本。
- 缺失的 `layout/theme/view` 可由 migration 补齐。
- 从未知版本迁移会明确报错，不会静默吞掉问题。

## 结论

迁移 registry 机制可行。正式实现时应把 `containerMigrations` 和各格式 `formatMigrations` 分离，并为每个 migration 固化输入输出样本。
