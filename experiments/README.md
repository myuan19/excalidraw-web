# 多格式文件系统技术验证

本目录按 `docs/多格式文件系统长期规划.md` 的技术验证清单组织，每个验证项一个独立文件夹。

## 运行方式

在仓库根目录执行：

```bash
for f in experiments/*/validate.mjs; do node "$f"; done
```

每个脚本会在对应目录生成 `result.json`。验证结论以各目录的 `README.md` 为准。

## 结果总览

| 编号 | 验证项 | 结论 |
| --- | --- | --- |
| P0-1 | MindMap 独立 payload 保存与恢复 | 通过 |
| P0-2 | 当前文件系统保存非 Excalidraw payload | 通过 |
| P0-3 | 旧 `.excalidraw` 文件兼容 | 通过 |
| P0-4 | MindMap 编辑器嵌入 React/Vite | 通过 |
| P0-5 | 多格式 hash 与 dirty 判断 | 通过 |
| P1-1 | 格式识别 `detectFormat(file)` | 通过 |
| P1-2 | 最小迁移 registry | 通过 |
| P1-3 | MindMap 图片与附件存储 | 通过但范围受限：MVP 先支持 inline/base64 风格图片 |
| P1-4 | 文件列表多格式路由 | 通过：`kind` 已贯通服务端、文件列表和打开路由；导入仍待后续阶段 |
| P1-5 | 第三种格式 adapter | 通过 |
| P2-1 | ExcalidrawAdapter | 通过 |
| P2-2 | MindMapAdapter MVP | 通过 |
| P2-3 | `detectFormat` 与 MindMap 导入 | 通过 |
| P2-4 | todo-list 全部完成验证 | 通过 |
| P2-5 | 共享 AI 配置入口 | 通过 |

## 总结

多格式文件系统的核心存储、文档级 hash、文件 `kind` 路由、ManagedDocument 兼容、adapter registry、MindMap 编辑器、统一导入导出、迁移骨架、第三种格式验证、共享 AI 配置入口和待办清单事项已完成。

后续若继续深化，优先方向是增加真实端到端 UI 测试、丰富 MindMap 工具栏和外部资产系统。
