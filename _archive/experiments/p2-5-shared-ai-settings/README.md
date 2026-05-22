# P2-5 共享 AI 配置入口

## 结论

PASS：首页、Excalidraw AI 功能与 MindMap 编辑器复用同一套 `AISettings` 与 `aiConfig`，配置由 `/api/ai-settings` 持久化。

## 验证点

- `AISettings` 文案明确说明配置由首页、Excalidraw 和 MindMap 共用。
- `aiConfig` 仍是唯一浏览器侧缓存、订阅和服务端持久化入口。
- `FileList` 与 `MindMapEditorShell` 均打开同一个 `AISettings` 组件。
- Excalidraw 的 `AIComponents` 仍通过同一个 `aiConfig` 读取配置。

## 运行

```bash
node experiments/p2-5-shared-ai-settings/validate.mjs
```
