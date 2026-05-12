# P0-4 MindMap 编辑器嵌入 React/Vite

## 验证内容

验证 `simple-mind-map` 是否适合作为独立编辑器嵌入 `excalidraw-web` 的 React/Vite 应用。

重点检查：

- `excalidraw-web` 是否具备 React/Vite 环境。
- `simple-mind-map` 是否声明不依赖框架。
- MindMap 构造函数是否接收 DOM `el`。
- MindMap 是否提供 `destroy()` 清理入口。
- 当前 `excalidraw-web` 是否已经具备 MindMap 运行依赖。

## 如何验证

运行：

```bash
node experiments/p0-4-mindmap-react-vite-shell/validate.mjs
```

脚本静态检查 `package.json`、`/root/projects/archive/mind-map/README.md` 和 `simple-mind-map/index.js`。

## 结果

结论：`PARTIAL_PASS_NEEDS_DEPENDENCY_INSTALL_AND_BROWSER_POC`

已确认：

- `excalidraw-web` 是 React/Vite 环境。
- `simple-mind-map` 文档说明其 JS 库不依赖框架。
- MindMap 构造函数接收 `el`。
- MindMap 提供 `destroy()`，会解绑事件、移除 SVG、清理容器。

阻塞：

- `excalidraw-web` 当前缺少运行依赖：`@svgdotjs/svg.js`、`deepmerge`、`eventemitter3`、`quill`。
- 尚未在真实浏览器里跑 React shell。

## 结论

嵌入方向可行，但不能直接开始功能开发。下一步应先安装或别名化 MindMap 依赖，再做一个最小 React 组件：`ref` 容器初始化 MindMap，`useEffect` cleanup 调用 `destroy()`，验证创建节点、保存和重新打开。
