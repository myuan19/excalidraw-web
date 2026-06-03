# P1-6 MindMap SVG Thumbnail Normalization

验证 MindMap `export('svg')` 返回的 SVG data URL 能否稳定转换为文件列表卡片可内嵌渲染的 SVG。

## 运行

```bash
node _experiments/p1-6-mindmap-svg-thumbnail/validate.mjs
```

## 判定

通过条件：

- raw SVG、base64 data URL、utf8 data URL 都能解码。
- 输出以 `<svg>` 为根。
- 输出包含 `xmlns="http://www.w3.org/2000/svg"`。
- 输出包含 `viewBox`；若原始 SVG 只有 `width/height`，则从尺寸派生。
- 输出适合卡片容器：`width="100%"`、`height="100%"`、`preserveAspectRatio="xMidYMid meet"`。

## 结论

见 `result.json`。
