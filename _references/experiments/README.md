# 多格式文件系统技术验证

本目录按 `docs/多格式文件系统长期规划.md` 的技术验证清单组织，每个验证项一个独立文件夹。

## 运行方式

在仓库根目录执行：

```bash
for f in _references/experiments/*/validate.mjs; do node "$f"; done
```

每个脚本会在对应目录生成 `result.json`。验证结论以各目录的 `README.md` 为准。

## 结果总览

| 编号 | 验证项 | 结论 |
| --- | --- | --- |
| P0-1 | MindMap 独立 payload 保存与恢复 | 部分通过：API 形状和 JSON 往返成立，仍需浏览器运行时验证 |
| P0-2 | 当前文件系统保存非 Excalidraw payload | 通过 |
| P0-3 | 旧 `.excalidraw` 文件兼容 | 通过，但本地缓存仍有 scene 结构风险 |
| P0-4 | MindMap 编辑器嵌入 React/Vite | 部分通过：代码边界成立，缺依赖和浏览器 PoC |
| P0-5 | 多格式 hash 与 dirty 判断 | 未通过：当前 hash 会忽略 MindMap 数据 |
| P1-1 | 格式识别 `detectFormat(file)` | 通过 |
| P1-2 | 最小迁移 registry | 通过 |
| P1-3 | MindMap 图片与附件存储 | 部分通过：JSON 保留成立，仍需浏览器渲染验证 |
| P1-4 | 文件列表多格式路由 | 未通过：当前缺少 `kind` 路由 |
| P1-5 | 第三种格式 adapter | 通过 |

## 总结

多格式文件系统的核心存储和 adapter 方向可行，但正式开发前必须先处理两项阻塞：

1. 引入文档级 hash，替换多格式边界上的 `hashSceneSnapshot`。
2. 在服务端文件记录、文件列表和打开入口传递 `kind`，实现多编辑器路由。
