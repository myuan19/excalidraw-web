import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, "output");
const SVG_DIR = join(OUTPUT, "svgs");
const CARD_W = 358;
const CARD_H = 215;
const ASPECT = 5 / 3;
const BASELINE_ROOT_SCREEN_RATIO = 0.224;
const BASELINE_NODE_COUNT = 10;
const MIN_VISUAL_SCALE_NODE_COUNT = 40;
const SINGLE_NODE_VISUAL_SCALE = 1.2;
const MIN_NODE_VISUAL_SCALE = 0.8;
const CENTER_TOWARD_OTHERS_RATIO = 0.2;
const ROOT_CENTER_LIMIT_RATIO = 0.25;

mkdirSync(OUTPUT, { recursive: true });
rmSync(SVG_DIR, { recursive: true, force: true });
mkdirSync(SVG_DIR, { recursive: true });

function clamp(value, min, max) {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function round(value) {
  return Number(value.toFixed(2));
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getSvgAttr(svg, name) {
  return svg.match(new RegExp(`\\s${name}="([^"]*)"`, "i"))?.[1] ?? "";
}

function setSvgAttr(svg, name, value) {
  const openTag = svg.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  if (!openTag) {
    return svg;
  }
  const attrRe = new RegExp(`\\s${name}="[^"]*"`, "i");
  if (attrRe.test(openTag)) {
    return svg.replace(attrRe, ` ${name}="${escapeXml(value)}"`);
  }
  return svg.replace(/<svg\b/i, `<svg ${name}="${escapeXml(value)}"`);
}

function patchForCard(svg) {
  return svg.replace(
    /(<svg\b)((?:\s+[a-z][a-z0-9-]*(?:="[^"]*")?)*?)(\s*>)/i,
    (_match, open, attrs, close) => {
      const cleaned = attrs
        .replace(/\s+preserveAspectRatio="[^"]*"/i, "")
        .replace(/\s+width="[^"]*"/i, "")
        .replace(/\s+height="[^"]*"/i, "");
      return `${open}${cleaned} preserveAspectRatio="xMidYMid meet" width="100%" height="100%"${close}`;
    },
  );
}

function nodeRect(text, x, y, layer = 1, root = false) {
  const font = root ? 24 : layer === 1 ? 18 : 14;
  const width = root
    ? 154
    : Math.max(64, Math.min(260, text.length * font * 0.9 + 32));
  const height = root ? 45 : layer === 1 ? 38 : 32;
  const fill = root ? "#1e3556" : layer === 1 ? "#a9dada" : "transparent";
  const textColor = root || layer === 1 ? "#fff" : "#1e3556";
  return {
    x,
    y,
    width,
    height,
    layer,
    root,
    markup: `<g class="smm-node${root ? " smm-root-node" : ""}" transform="matrix(1,0,0,1,${x},${y})">
<rect width="${width}" height="${height}" rx="${root ? 10 : 5}" ry="${root ? 10 : 5}" class="smm-node-shape" fill="${fill}" stroke="#1e3556" stroke-width="${root || layer === 1 ? 2 : 1}"></rect>
<text x="${width / 2}" y="${height / 2 + font * 0.35}" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="${font}" fill="${textColor}" font-weight="${root ? "700" : "400"}">${escapeXml(text)}</text>
<rect width="${width + 4}" height="${height + 4}" x="-2" y="-2" class="smm-hover-node" rx="5" ry="5" fill="none" stroke="#5ec8f8"></rect>
</g>`,
  };
}

function line(from, to) {
  const toLeft = to.x < from.x;
  const sx = toLeft ? from.x : from.x + from.width;
  const sy = from.y + from.height / 2;
  const ex = toLeft ? to.x + to.width : to.x;
  const ey = to.y + to.height / 2;
  const mid = sx + (toLeft ? -1 : 1) * Math.max(26, Math.abs(ex - sx) * 0.45);
  return `<path d="M ${sx},${sy}L ${mid},${sy}L ${mid},${ey}L ${ex},${ey}" stroke="#1e3556" stroke-width="2" fill="none"></path>`;
}

function buildSvg({ id, title, width, height, nodes, edges, extraMarkup = "" }) {
  const lines = edges.map(([from, to]) => line(nodes[from], nodes[to])).join("\n");
  const nodeMarkup = nodes.map((node) => node.markup).join("\n");
  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background-color:#f1f1f1;" xmlns="http://www.w3.org/2000/svg">
<title>${escapeXml(title)}</title>
<rect x="0" y="0" width="${width}" height="${height}" fill="#f1f1f1"></rect>
<g class="smm-container" transform="matrix(1,0,0,1,0,0)">
<g class="smm-line-container">${lines}</g>
<g class="smm-node-container">${nodeMarkup}</g>
${extraMarkup}
</g>
</svg>`;
  return { id, title, width, height, nodes, edges, svg };
}

function singleRootScenario() {
  return buildSvg({
    id: "single-root",
    title: "只有中心主题",
    width: 900,
    height: 540,
    nodes: [nodeRect("中心主题", 370, 245, 0, true)],
    edges: [],
  });
}

function singleRootWithTailScenario() {
  const root = nodeRect("中心主题", 180, 250, 0, true);
  const extraMarkup = `<g class="smm-tail-marker" transform="matrix(1,0,0,1,420,248)">
<path d="M 0 26 C 55 -18 185 -18 240 26 C 185 70 55 70 0 26 Z" fill="transparent" stroke="#1e3556" stroke-width="2" stroke-dasharray="5 5"></path>
<text x="120" y="32" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="14" fill="#1e3556">跟随元素</text>
</g>`;
  return buildSvg({
    id: "single-root-tail",
    title: "单节点 + 跟随元素",
    width: 900,
    height: 540,
    nodes: [root],
    edges: [],
    extraMarkup,
  });
}

function compactScenario() {
  const nodes = [nodeRect("中心主题", 260, 320, 0, true)];
  const edges = [];
  for (let i = 0; i < 6; i++) {
    const node = nodeRect(`分支 ${i + 1}`, 560, 150 + i * 74, 1);
    edges.push([0, nodes.length]);
    nodes.push(node);
  }
  return buildSvg({
    id: "compact",
    title: "普通中等规模",
    width: 1200,
    height: 780,
    nodes,
    edges,
  });
}

function wideSiblingsScenario() {
  const nodes = [nodeRect("中心主题", 260, 900, 0, true)];
  const edges = [];
  for (let i = 0; i < 28; i++) {
    const node = nodeRect(`同级节点 ${i + 1}`, 560, 80 + i * 64, 1);
    edges.push([0, nodes.length]);
    nodes.push(node);
  }
  return buildSvg({
    id: "wide-siblings",
    title: "同级节点很多",
    width: 1600,
    height: 1900,
    nodes,
    edges,
  });
}

function deepChainScenario() {
  const nodes = [nodeRect("中心主题", 180, 360, 0, true)];
  const edges = [];
  for (let i = 1; i <= 18; i++) {
    const node = nodeRect(`第 ${i} 层`, 180 + i * 185, 360 + Math.sin(i / 2) * 68, Math.min(i, 3));
    edges.push([nodes.length - 1, nodes.length]);
    nodes.push(node);
  }
  return buildSvg({
    id: "deep-chain",
    title: "深度很多",
    width: 3850,
    height: 900,
    nodes,
    edges,
  });
}

function leftHeavyScenario() {
  const nodes = [nodeRect("中心主题", 980, 700, 0, true)];
  const edges = [];
  for (let i = 0; i < 14; i++) {
    const node = nodeRect(`左侧节点 ${i + 1}`, 650 - (i % 4) * 150, 90 + i * 92, Math.min(i + 1, 3));
    edges.push([0, nodes.length]);
    nodes.push(node);
  }
  return buildSvg({
    id: "left-heavy",
    title: "左侧展开很多",
    width: 1600,
    height: 1600,
    nodes,
    edges,
  });
}

function twoSidedScenario() {
  const nodes = [nodeRect("中心主题", 920, 700, 0, true)];
  const edges = [];
  for (let i = 0; i < 10; i++) {
    const left = nodeRect(`左分支 ${i + 1}`, 560 - (i % 2) * 120, 130 + i * 122, 1);
    const right = nodeRect(`右分支 ${i + 1}`, 1240 + (i % 2) * 120, 130 + i * 122, 1);
    edges.push([0, nodes.length]);
    nodes.push(left);
    edges.push([0, nodes.length]);
    nodes.push(right);
  }
  return buildSvg({
    id: "two-sided",
    title: "左右两侧展开",
    width: 2100,
    height: 1600,
    nodes,
    edges,
  });
}

function balancedTreeScenario() {
  const nodes = [nodeRect("中心主题", 260, 740, 0, true)];
  const edges = [];
  for (let i = 0; i < 5; i++) {
    const parentIndex = nodes.length;
    const parent = nodeRect(`一级 ${i + 1}`, 560, 260 + i * 250, 1);
    edges.push([0, parentIndex]);
    nodes.push(parent);
    for (let j = 0; j < 3; j++) {
      const childIndex = nodes.length;
      const child = nodeRect(`二级 ${i + 1}.${j + 1}`, 840, parent.y - 76 + j * 76, 2);
      edges.push([parentIndex, childIndex]);
      nodes.push(child);
      for (let k = 0; k < 2; k++) {
        const leafIndex = nodes.length;
        const leaf = nodeRect(`三级 ${i + 1}.${j + 1}.${k + 1}`, 1110, child.y - 24 + k * 48, 3);
        edges.push([childIndex, leafIndex]);
        nodes.push(leaf);
      }
    }
  }
  return buildSvg({
    id: "balanced-tree",
    title: "平衡多层树",
    width: 1700,
    height: 1750,
    nodes,
    edges,
  });
}

function verticalExtremeScenario() {
  const nodes = [nodeRect("中心主题", 300, 1280, 0, true)];
  const edges = [];
  for (let i = 0; i < 32; i++) {
    const node = nodeRect(`上下节点 ${i + 1}`, 620, 80 + i * 80, 1);
    edges.push([0, nodes.length]);
    nodes.push(node);
  }
  return buildSvg({
    id: "vertical-extreme",
    title: "上下高度极大",
    width: 1600,
    height: 2700,
    nodes,
    edges,
  });
}

function farClusterScenario() {
  const nodes = [nodeRect("中心主题", 180, 400, 0, true)];
  const edges = [];
  for (let i = 0; i < 9; i++) {
    const node = nodeRect(`远端节点 ${i + 1}`, 1400 + (i % 3) * 190, 180 + Math.floor(i / 3) * 170, 1);
    edges.push([0, nodes.length]);
    nodes.push(node);
  }
  return buildSvg({
    id: "far-cluster",
    title: "其他节点远离 root",
    width: 2200,
    height: 1000,
    nodes,
    edges,
  });
}

function parseTranslate(markup) {
  const match = markup.match(
    /transform="matrix\([^,]+,[^,]+,[^,]+,[^,]+,([^,]+),([^)]+)\)"/,
  );
  if (!match) {
    return null;
  }
  const x = Number.parseFloat(match[1]);
  const y = Number.parseFloat(match[2]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function getNumberAttr(markup, name) {
  const value = markup.match(new RegExp(`\\s${name}="([^"]*)"`, "i"))?.[1];
  if (!value) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getContainerOffset(svg) {
  const match = svg.match(/<g\b[^>]*class="[^"]*\bsmm-container\b[^"]*"[^>]*>/i);
  return match ? parseTranslate(match[0]) ?? { x: 0, y: 0 } : { x: 0, y: 0 };
}

function parseNodeBounds(svg) {
  const container = getContainerOffset(svg);
  const nodes = [];
  for (const match of svg.matchAll(
    /<g\b[^>]*class="[^"]*\bsmm-node\b[^"]*"[^>]*>[\s\S]*?<\/g>/gi,
  )) {
    const point = parseTranslate(match[0]);
    if (!point) {
      continue;
    }
    const rects = [...match[0].matchAll(/<rect\b[^>]*>/gi)];
    const sizes = rects
      .map((rect) => ({
        width: getNumberAttr(rect[0], "width"),
        height: getNumberAttr(rect[0], "height"),
        x: Number.parseFloat(rect[0].match(/\sx="([^"]*)"/i)?.[1] ?? "0"),
        y: Number.parseFloat(rect[0].match(/\sy="([^"]*)"/i)?.[1] ?? "0"),
      }))
      .filter((size) => size.width && size.height);
    const shape =
      sizes.find((size) => Number.isFinite(size.x) && size.x >= 0 && Number.isFinite(size.y) && size.y >= 0) ??
      sizes[0] ?? { width: 154, height: 45, x: 0, y: 0 };
    nodes.push({
      x: point.x + container.x + (Number.isFinite(shape.x) ? shape.x : 0),
      y: point.y + container.y + (Number.isFinite(shape.y) ? shape.y : 0),
      width: shape.width,
      height: shape.height,
    });
  }
  return nodes;
}

function centerOf(bounds) {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}

function unionBounds(boundsList) {
  if (boundsList.length === 0) {
    return null;
  }
  const minX = Math.min(...boundsList.map((item) => item.x));
  const minY = Math.min(...boundsList.map((item) => item.y));
  const maxX = Math.max(...boundsList.map((item) => item.x + item.width));
  const maxY = Math.max(...boundsList.map((item) => item.y + item.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function computeNodeVisualScale(nodeCount) {
  if (nodeCount <= BASELINE_NODE_COUNT) {
    const t = (BASELINE_NODE_COUNT - nodeCount) / (BASELINE_NODE_COUNT - 1);
    return 1 + clamp(t, 0, 1) * (SINGLE_NODE_VISUAL_SCALE - 1);
  }
  const t =
    (nodeCount - BASELINE_NODE_COUNT) /
    (MIN_VISUAL_SCALE_NODE_COUNT - BASELINE_NODE_COUNT);
  return 1 - clamp(t, 0, 1) * (1 - MIN_NODE_VISUAL_SCALE);
}

function clampCenterToKeepRootInMiddleHalf(center, rootCenter, viewSize) {
  const xLimit = viewSize.width * ROOT_CENTER_LIMIT_RATIO;
  const yLimit = viewSize.height * ROOT_CENTER_LIMIT_RATIO;
  return {
    x: clamp(center.x, rootCenter.x - xLimit, rootCenter.x + xLimit),
    y: clamp(center.y, rootCenter.y - yLimit, rootCenter.y + yLimit),
  };
}

function computeFocusedViewBox(svg) {
  const nodes = parseNodeBounds(svg);
  const rootBounds = nodes[0] ?? { x: 0, y: 0, width: 154, height: 45 };
  const otherBounds = unionBounds(nodes.slice(1));
  const allBounds = unionBounds(nodes) ?? rootBounds;
  const rootCenter = centerOf(rootBounds);
  const otherCenter = otherBounds ? centerOf(otherBounds) : rootCenter;
  const nodeVisualScale = computeNodeVisualScale(nodes.length);
  const targetRootRatio = BASELINE_ROOT_SCREEN_RATIO * nodeVisualScale;

  const baseWidth = Math.max(
    rootBounds.width / targetRootRatio,
    (rootBounds.height / targetRootRatio) * ASPECT,
  );
  const baseHeight = baseWidth / ASPECT;
  const viewSize = { width: baseWidth, height: baseHeight };

  const rawCenter = {
    x: rootCenter.x + (otherCenter.x - rootCenter.x) * CENTER_TOWARD_OTHERS_RATIO,
    y: rootCenter.y + (otherCenter.y - rootCenter.y) * CENTER_TOWARD_OTHERS_RATIO,
  };
  const limitedCenter = clampCenterToKeepRootInMiddleHalf(
    rawCenter,
    rootCenter,
    viewSize,
  );

  const x = limitedCenter.x - viewSize.width / 2;
  const y = limitedCenter.y - viewSize.height / 2;
  const actualCenter = {
    x: x + viewSize.width / 2,
    y: y + viewSize.height / 2,
  };
  const rootScreen = {
    centerX: ((rootCenter.x - x) / viewSize.width) * 100,
    centerY: ((rootCenter.y - y) / viewSize.height) * 100,
  };

  return {
    viewBox: {
      x,
      y,
      width: viewSize.width,
      height: viewSize.height,
    },
    metrics: {
      nodes: nodes.length,
      nodeVisualScale,
      targetRootRatio,
      rootBounds,
      otherBounds,
      allBounds,
      rootCenter,
      otherCenter,
      rawCenter,
      limitedCenter,
      actualCenter,
      viewSize,
      rootCenterLimit: {
        x: viewSize.width * ROOT_CENTER_LIMIT_RATIO,
        y: viewSize.height * ROOT_CENTER_LIMIT_RATIO,
      },
      rootScreen,
      rootVisualRatio: rootBounds.width / viewSize.width,
      actualVisualScale: rootBounds.width / viewSize.width / BASELINE_ROOT_SCREEN_RATIO,
    },
  };
}

function applyFocusedViewBox(svg) {
  const result = computeFocusedViewBox(svg);
  const viewBox = result.viewBox;
  return {
    ...result,
    svg: setSvgAttr(
      svg,
      "viewBox",
      `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`,
    ),
  };
}

function buildHtml(items) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>MindMap 首页预览聚焦算法实验</title>
  <style>
    body { margin: 0; padding: 24px; background: #e5e7eb; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111827; }
    h1 { font-size: 20px; margin: 0 0 10px; }
    .intro { max-width: 1120px; color: #4b5563; font-size: 13px; line-height: 1.6; margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: repeat(2, max-content); gap: 22px; align-items: start; }
    .item { background: #fff; border-radius: 14px; padding: 12px; box-shadow: 0 4px 14px rgba(15, 23, 42, .14); }
    .compare { display: grid; grid-template-columns: max-content max-content; gap: 10px; }
    .card { width: ${CARD_W}px; height: ${CARD_H}px; overflow: hidden; border-radius: 10px; background: #f1f1f1; border: 1px solid #d1d5db; }
    .card svg { display: block; width: 100%; height: 100%; }
    .title { font-size: 13px; font-weight: 700; margin: 10px 0 4px; }
    .label { font-size: 12px; font-weight: 700; color: #374151; margin: 0 0 6px; }
    .metric { font-size: 11px; color: #6b7280; margin-top: 5px; max-width: ${CARD_W}px; overflow-wrap: anywhere; line-height: 1.45; }
  </style>
</head>
<body>
  <h1>MindMap 首页预览聚焦算法实验</h1>
  <div class="intro">
    左侧是当前全局截图的完整视野，右侧是新算法：以 root 到其他节点范围中心的 1/5 处作为目标中心；
    约 10 个节点时 root 视觉大小为 1，单节点约 1.2，节点很多时最低约 0.8；若目标中心会让 root 超出视窗中心 50% 区域，则把中心向 root 拉回到临界位置。
  </div>
  <div class="grid">
    ${items.map((item) => `<section class="item" id="${item.id}">
      <div class="compare">
        <div>
          <div class="label">全局截图</div>
          <div class="card">${item.globalSvg}</div>
        </div>
        <div>
          <div class="label">新算法</div>
          <div class="card">${item.focusedSvg}</div>
        </div>
      </div>
      <div class="title">${item.title}</div>
      <div class="metric">viewBox: ${item.viewBox}</div>
      <div class="metric">节点视觉比例: ${item.metrics.actualVisualScale.toFixed(2)} · 目标比例: ${item.metrics.nodeVisualScale.toFixed(2)} · root占视野宽: ${(item.metrics.rootVisualRatio * 100).toFixed(1)}% · 节点数: ${item.metrics.nodes}</div>
      <div class="metric">root屏幕位置: (${round(item.metrics.rootScreen.centerX)}%, ${round(item.metrics.rootScreen.centerY)}%) · root中心: (${round(item.metrics.rootCenter.x)}, ${round(item.metrics.rootCenter.y)}) · 其他中心: (${round(item.metrics.otherCenter.x)}, ${round(item.metrics.otherCenter.y)}) · 原始中心: (${round(item.metrics.rawCenter.x)}, ${round(item.metrics.rawCenter.y)}) · 实际中心: (${round(item.metrics.actualCenter.x)}, ${round(item.metrics.actualCenter.y)})</div>
    </section>`).join("\n")}
  </div>
</body>
</html>`;
}

const scenarios = [
  singleRootScenario(),
  singleRootWithTailScenario(),
  compactScenario(),
  wideSiblingsScenario(),
  deepChainScenario(),
  leftHeavyScenario(),
  twoSidedScenario(),
  balancedTreeScenario(),
  verticalExtremeScenario(),
  farClusterScenario(),
];

const summary = [];
const htmlItems = [];

for (const scenario of scenarios) {
  const globalSvg = patchForCard(setSvgAttr(scenario.svg, "viewBox", `0 0 ${scenario.width} ${scenario.height}`));
  const focused = applyFocusedViewBox(scenario.svg);
  const focusedSvg = patchForCard(focused.svg);
  const viewBox = [
    focused.viewBox.x,
    focused.viewBox.y,
    focused.viewBox.width,
    focused.viewBox.height,
  ].map(round).join(" ");

  writeFileSync(join(SVG_DIR, `${scenario.id}__global.svg`), globalSvg, "utf8");
  writeFileSync(join(SVG_DIR, `${scenario.id}__focused.svg`), focusedSvg, "utf8");

  summary.push({
    id: scenario.id,
    title: scenario.title,
    viewBox,
    nodeVisualScale: round(focused.metrics.nodeVisualScale),
    actualVisualScale: round(focused.metrics.actualVisualScale),
    targetRootRatio: round(focused.metrics.targetRootRatio),
    rootVisualRatio: round(focused.metrics.rootVisualRatio),
    rootCenter: {
      x: round(focused.metrics.rootCenter.x),
      y: round(focused.metrics.rootCenter.y),
    },
    otherCenter: {
      x: round(focused.metrics.otherCenter.x),
      y: round(focused.metrics.otherCenter.y),
    },
    rawCenter: {
      x: round(focused.metrics.rawCenter.x),
      y: round(focused.metrics.rawCenter.y),
    },
    limitedCenter: {
      x: round(focused.metrics.limitedCenter.x),
      y: round(focused.metrics.limitedCenter.y),
    },
    actualCenter: {
      x: round(focused.metrics.actualCenter.x),
      y: round(focused.metrics.actualCenter.y),
    },
    rootScreen: {
      centerX: round(focused.metrics.rootScreen.centerX),
      centerY: round(focused.metrics.rootScreen.centerY),
    },
    rootCenterLimit: {
      x: round(focused.metrics.rootCenterLimit.x),
      y: round(focused.metrics.rootCenterLimit.y),
    },
    allBounds: {
      x: round(focused.metrics.allBounds.x),
      y: round(focused.metrics.allBounds.y),
      width: round(focused.metrics.allBounds.width),
      height: round(focused.metrics.allBounds.height),
    },
    otherBounds: focused.metrics.otherBounds
      ? {
          x: round(focused.metrics.otherBounds.x),
          y: round(focused.metrics.otherBounds.y),
          width: round(focused.metrics.otherBounds.width),
          height: round(focused.metrics.otherBounds.height),
        }
      : null,
  });
  htmlItems.push({
    id: scenario.id,
    title: scenario.title,
    globalSvg,
    focusedSvg,
    viewBox,
    metrics: focused.metrics,
  });
}

writeFileSync(join(OUTPUT, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
writeFileSync(join(OUTPUT, "preview-focus-experiment.html"), buildHtml(htmlItems), "utf8");

console.log("实验目标:");
console.log("1. 从全局截图/完整 SVG bounds 出发。");
console.log("2. 定位 root 与其他节点范围，取 root -> 其他节点中心 1/5 的位置作为图片中心。");
console.log("3. 约 10 个节点时 root 视觉大小为 1；单节点约 1.2；节点很多时最低约 0.8。");
console.log("4. 若目标中心会让 root 超出视窗中心 50% 区域，则把中心向 root 拉回到临界位置。");
console.log("");
for (const item of summary) {
  console.log(
    `${item.id}: viewBox=${item.viewBox}, visualScale=${item.actualVisualScale.toFixed(2)}, targetScale=${item.nodeVisualScale.toFixed(2)}, rootRatio=${(item.rootVisualRatio * 100).toFixed(1)}%, rootScreen=(${item.rootScreen.centerX}%, ${item.rootScreen.centerY}%), actualCenter=(${item.actualCenter.x}, ${item.actualCenter.y})`,
  );
}
console.log("");
console.log(`输出: ${OUTPUT}`);
console.log(`总览: ${join(OUTPUT, "preview-focus-experiment.html")}`);
