import { chromium } from "playwright";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, "output", "stress-variants");
const CARD_W = 358;
const CARD_H = 215;
const ASPECT = 5 / 3;

rmSync(OUTPUT, { recursive: true, force: true });
mkdirSync(OUTPUT, { recursive: true });

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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
  const escaped = escapeXml(value);
  const attrRe = new RegExp(`\\s${name}="[^"]*"`, "i");
  if (attrRe.test(openTag)) {
    return svg.replace(attrRe, ` ${name}="${escaped}"`);
  }
  return svg.replace(/<svg\b/i, `<svg ${name}="${escaped}"`);
}

function patchForCard(svg) {
  return svg.replace(
    /(<svg\b)((?:\s+[a-z][a-z0-9-]*(?:="[^"]*")?)*?)(\s*>)/i,
    (_m, open, attrs, close) => {
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
  const w = root ? 154 : Math.max(64, Math.min(240, text.length * font * 0.9 + 32));
  const h = root ? 45 : layer === 1 ? 38 : 32;
  const fill = root ? "#1e3556" : layer === 1 ? "#a9dada" : "transparent";
  const textColor = root || layer === 1 ? "#fff" : "#1e3556";
  return {
    x,
    y,
    w,
    h,
    layer,
    markup: `<g class="smm-node" transform="matrix(1,0,0,1,${x},${y})">
<rect width="${w}" height="${h}" rx="${root ? 10 : 5}" ry="${root ? 10 : 5}" class="smm-node-shape" fill="${fill}" stroke="#1e3556" stroke-width="${root || layer === 1 ? 2 : 1}"></rect>
<text x="${w / 2}" y="${h / 2 + font * 0.35}" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="${font}" fill="${textColor}" font-weight="${root ? "700" : "400"}">${escapeXml(text)}</text>
<rect width="${w + 4}" height="${h + 4}" x="-2" y="-2" class="smm-hover-node" rx="5" ry="5" fill="none" stroke="#5ec8f8"></rect>
</g>`,
  };
}

function line(from, to) {
  const toLeft = to.x < from.x;
  const sx = toLeft ? from.x : from.x + from.w;
  const sy = from.y + from.h / 2;
  const ex = toLeft ? to.x + to.w : to.x;
  const ey = to.y + to.h / 2;
  const mid = sx + (toLeft ? -1 : 1) * Math.max(26, Math.abs(ex - sx) * 0.45);
  return `<path d="M ${sx},${sy}L ${mid},${sy}L ${mid},${ey}L ${ex},${ey}" stroke="#1e3556" stroke-width="2" fill="none"></path>`;
}

function buildSvg({ id, title, width, height, nodes, edges }) {
  const nodeMarkup = nodes.map((n) => n.markup).join("\n");
  const lineMarkup = edges.map(([a, b]) => line(nodes[a], nodes[b])).join("\n");
  return {
    id,
    title,
    svg: `<svg width="${width}" height="${height}" style="background-color:#f1f1f1;" xmlns="http://www.w3.org/2000/svg">
<title>${escapeXml(title)}</title>
<g class="smm-container" transform="matrix(1,0,0,1,0,0)">
<g class="smm-line-container">${lineMarkup}</g>
<g class="smm-node-container">${nodeMarkup}</g>
<g class="smm-associative-line-container"><path d="M 0 0L10 10"></path><line x1="0" y1="0" x2="50" y2="50"></line><circle cx="20" cy="20" r="10"></circle></g>
</g>
</svg>`,
  };
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

function wideSiblingsScenario() {
  const nodes = [nodeRect("中心主题", 260, 900, 0, true)];
  const edges = [];
  for (let i = 0; i < 28; i++) {
    const n = nodeRect(`同级节点 ${i + 1}`, 560, 80 + i * 64, 1);
    edges.push([0, nodes.length]);
    nodes.push(n);
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

function compactScenario() {
  const nodes = [nodeRect("中心主题", 260, 320, 0, true)];
  const edges = [];
  for (let i = 0; i < 6; i++) {
    const n = nodeRect(`分支 ${i + 1}`, 560, 150 + i * 74, 1);
    edges.push([0, nodes.length]);
    nodes.push(n);
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

function deepChainScenario() {
  const nodes = [nodeRect("中心主题", 180, 360, 0, true)];
  const edges = [];
  for (let i = 1; i <= 18; i++) {
    const n = nodeRect(`第 ${i} 层`, 180 + i * 185, 360 + Math.sin(i / 2) * 68, Math.min(i, 3));
    edges.push([nodes.length - 1, nodes.length]);
    nodes.push(n);
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
    const n = nodeRect(`左侧节点 ${i + 1}`, 650 - (i % 4) * 150, 90 + i * 92, Math.min(i + 1, 3));
    edges.push([0, nodes.length]);
    nodes.push(n);
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

function mixedScenario() {
  const nodes = [nodeRect("中心主题", 300, 850, 0, true)];
  const edges = [];
  for (let i = 0; i < 10; i++) {
    const parentIndex = nodes.length;
    const parent = nodeRect(`主分支 ${i + 1}`, 620, 180 + i * 155, 1);
    edges.push([0, parentIndex]);
    nodes.push(parent);
    let previous = parentIndex;
    for (let j = 0; j < 6; j++) {
      const childIndex = nodes.length;
      const child = nodeRect(`细节 ${i + 1}-${j + 1}`, 840 + j * 160, parent.y + (j % 2 ? 36 : -36), 2);
      edges.push([previous, childIndex]);
      nodes.push(child);
      previous = childIndex;
    }
  }
  return buildSvg({
    id: "wide-deep-mixed",
    title: "同级多 + 深度多",
    width: 2100,
    height: 1900,
    nodes,
    edges,
  });
}

function denseClusterScenario() {
  const nodes = [nodeRect("中心主题", 360, 620, 0, true)];
  const edges = [];
  for (let row = 0; row < 7; row++) {
    const parentIndex = nodes.length;
    const parent = nodeRect(`模块 ${row + 1}`, 650, 160 + row * 150, 1);
    edges.push([0, parentIndex]);
    nodes.push(parent);
    for (let col = 0; col < 5; col++) {
      const childIndex = nodes.length;
      const child = nodeRect(`任务 ${row + 1}.${col + 1}`, 850 + col * 155, parent.y - 46 + col * 23, 2);
      edges.push([parentIndex, childIndex]);
      nodes.push(child);
    }
  }
  return buildSvg({
    id: "dense-cluster",
    title: "密集簇状节点",
    width: 1800,
    height: 1400,
    nodes,
    edges,
  });
}

function verticalExtremeScenario() {
  const nodes = [nodeRect("中心主题", 300, 1280, 0, true)];
  const edges = [];
  for (let i = 0; i < 32; i++) {
    const n = nodeRect(`上下节点 ${i + 1}`, 620, 80 + i * 80, 1);
    edges.push([0, nodes.length]);
    nodes.push(n);
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

function longTextScenario() {
  const nodes = [nodeRect("中心主题", 260, 520, 0, true)];
  const edges = [];
  const texts = [
    "这是一条非常长的分支标题用于测试文本宽度",
    "较长节点内容会让画布横向跨度明显增加",
    "需要确认预览仍聚焦中心主题附近",
    "不要把所有超长内容全部塞进卡片里",
    "只保证根节点大小和局部可读性",
  ];
  texts.forEach((text, index) => {
    const n = nodeRect(text, 560 + index * 250, 260 + index * 128, Math.min(index + 1, 3));
    edges.push([Math.max(0, nodes.length - 1), nodes.length]);
    nodes.push(n);
  });
  return buildSvg({
    id: "long-text",
    title: "超长文本链路",
    width: 2400,
    height: 1200,
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

function getNodePoints(svg) {
  const points = [];
  for (const match of svg.matchAll(/<g\b[^>]*class="[^"]*\bsmm-node\b[^"]*"[^>]*>/gi)) {
    const point = parseTranslate(match[0]);
    if (point) {
      points.push(point);
    }
  }
  return points;
}

function getRootSize(svg) {
  const rootStart = svg.match(/<g\b[^>]*class="[^"]*\bsmm-node\b[^"]*"[^>]*>/i);
  if (!rootStart || rootStart.index === undefined) {
    return { width: 154, height: 45 };
  }
  const slice = svg.slice(rootStart.index, rootStart.index + 600);
  return {
    width: Number.parseFloat(slice.match(/\bwidth="([^"]+)"/i)?.[1] ?? "154"),
    height: Number.parseFloat(slice.match(/\bheight="([^"]+)"/i)?.[1] ?? "45"),
  };
}

function rootReadableCentered(svg, rootRatio, expand, rootCenterRatio) {
  const svgW = Number.parseFloat(getSvgAttr(svg, "width"));
  const svgH = Number.parseFloat(getSvgAttr(svg, "height"));
  const points = getNodePoints(svg);
  const root = points[0] ?? { x: 0, y: svgH / 2 };
  const rootSize = getRootSize(svg);
  const rootCenter = {
    x: root.x + rootSize.width / 2,
    y: root.y + rootSize.height / 2,
  };
  const vw = Math.min(svgW, (rootSize.width / rootRatio) * (1 + expand));
  const vh = vw / ASPECT;
  const vx = clamp(
    rootCenter.x - vw * rootCenterRatio,
    0,
    Math.max(svgW - vw, 0),
  );
  const vy = clamp(rootCenter.y - vh / 2, 0, Math.max(svgH - vh, 0));
  return setSvgAttr(svg, "viewBox", `${vx} ${vy} ${vw} ${vh}`);
}

function stripEditOverlays(svg) {
  return svg
    .replace(/<rect\b(?=[^>]*\bclass="[^"]*\bsmm-hover-node\b[^"]*")[^>]*(?:\/>|>[\s\S]*?<\/rect>)/gi, "")
    .replace(/<line\b[^>]*(?:\/>|>[\s\S]*?<\/line>)/gi, "")
    .replace(/<circle\b[^>]*(?:\/>|>[\s\S]*?<\/circle>)/gi, "")
    .replace(/\bclass="([^"]*)"/gi, (_m, value) => {
      const names = value.split(/\s+/).filter((name) => name && name !== "active" && name !== "smm-node-highlight");
      return `class="${names.join(" ")}"`;
    });
}

const scenarios = [
  singleRootScenario(),
  compactScenario(),
  wideSiblingsScenario(),
  deepChainScenario(),
  leftHeavyScenario(),
  twoSidedScenario(),
  balancedTreeScenario(),
  mixedScenario(),
  denseClusterScenario(),
  verticalExtremeScenario(),
  longTextScenario(),
];
const strategies = [
  [
    "root-20-10-center22",
    "根节点 20% +10% · 垂直居中 · 中心22%",
    (svg) => rootReadableCentered(svg, 0.2, 0.1, 0.22),
  ],
];

const items = [];
for (const scenario of scenarios) {
  for (const [strategyId, strategyTitle, apply] of strategies) {
    const id = `${scenario.id}__${strategyId}`;
    const svg = patchForCard(stripEditOverlays(apply(scenario.svg)));
    writeFileSync(join(OUTPUT, `${id}.svg`), svg, "utf8");
    items.push({
      id,
      scenario: scenario.title,
      strategy: strategyTitle,
      svg,
      viewBox: getSvgAttr(svg, "viewBox"),
    });
  }
}

const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>MindMap Stress Preview Variants</title>
  <style>
    body { margin: 0; padding: 24px; background: #e5e7eb; font-family: system-ui, sans-serif; color: #111827; }
    h1 { font-size: 18px; margin: 0 0 16px; }
    .grid { display: grid; grid-template-columns: repeat(3, max-content); gap: 20px; align-items: start; }
    .item { background: #fff; border-radius: 14px; padding: 12px; box-shadow: 0 4px 14px rgba(15, 23, 42, .14); }
    .card { width: ${CARD_W}px; height: ${CARD_H}px; overflow: hidden; border-radius: 10px; background: #f1f1f1; border: 1px solid #d1d5db; }
    .card svg { display: block; width: 100%; height: 100%; }
    .title { font-size: 13px; font-weight: 700; margin: 10px 0 4px; }
    .note { font-size: 12px; line-height: 1.45; color: #4b5563; max-width: ${CARD_W}px; }
    .metric { font-size: 11px; color: #6b7280; margin-top: 5px; max-width: ${CARD_W}px; overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <h1>MindMap 压力样例缩略图 · root-20-10-center22</h1>
  <div class="grid">
    ${items.map((item) => `<section class="item" id="${item.id}">
      <div class="card">${item.svg}</div>
      <div class="title">${item.scenario} · ${item.strategy}</div>
      <div class="metric">viewBox: ${item.viewBox}</div>
    </section>`).join("\n")}
  </div>
</body>
</html>`;

const htmlPath = join(OUTPUT, "stress-preview-variants.html");
writeFileSync(htmlPath, html, "utf8");
writeFileSync(
  join(OUTPUT, "summary.json"),
  JSON.stringify(items.map(({ id, scenario, strategy, viewBox }) => ({ id, scenario, strategy, viewBox })), null, 2),
  "utf8",
);

const browser = await chromium.launch({
  headless: true,
  executablePath: "/root/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1400 }, deviceScaleFactor: 1 });
  await page.goto(`file://${htmlPath}`);
  await page.screenshot({ path: join(OUTPUT, "all-stress-variants.png"), fullPage: true });
  for (const item of items) {
    await page.locator(`[id="${item.id}"] .card`).screenshot({
      path: join(OUTPUT, `${item.id}.png`),
    });
  }
} finally {
  await browser.close();
}

console.log(`Generated ${items.length} stress variants in ${OUTPUT}`);
console.log(join(OUTPUT, "all-stress-variants.png"));
