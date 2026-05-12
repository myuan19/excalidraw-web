import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, "output");
const VARIANT_DIR = join(OUTPUT, "preview-variants");
const CARD_W = 358;
const CARD_H = 215;
const ASPECT = 5 / 3;

mkdirSync(VARIANT_DIR, { recursive: true });

function getSvgAttr(svg, name) {
  return svg.match(new RegExp(`\\s${name}="([^"]*)"`, "i"))?.[1] ?? "";
}

function escapeXmlAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function setOrAddSvgAttr(svg, name, value) {
  const openTag = svg.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  if (!openTag) {
    return svg;
  }
  const attrRe = new RegExp(`\\s${name}="[^"]*"`, "i");
  if (attrRe.test(openTag)) {
    return svg.replace(attrRe, ` ${name}="${escapeXmlAttr(value)}"`);
  }
  return svg.replace(/<svg\b/i, `<svg ${name}="${escapeXmlAttr(value)}"`);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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

function getContainerOffset(svg) {
  const match = svg.match(/<g\b[^>]*class="[^"]*\bsmm-container\b[^"]*"[^>]*>/i);
  return match ? parseTranslate(match[0]) ?? { x: 0, y: 0 } : { x: 0, y: 0 };
}

function getNodePoints(svg) {
  const container = getContainerOffset(svg);
  const points = [];
  for (const match of svg.matchAll(/<g\b[^>]*class="[^"]*\bsmm-node\b[^"]*"[^>]*>/gi)) {
    const point = parseTranslate(match[0]);
    if (point) {
      points.push({ x: point.x + container.x, y: point.y + container.y });
    }
  }
  return points;
}

function getFirstNodeSlice(svg) {
  const re = /<g\b[^>]*class="[^"]*\bsmm-node\b[^"]*"[^>]*>/gi;
  const first = re.exec(svg);
  if (!first || first.index === undefined) {
    return "";
  }
  const second = re.exec(svg);
  return svg.slice(first.index, second?.index === undefined ? svg.length : second.index);
}

function getNumberAttr(markup, name) {
  const value = markup.match(new RegExp(`\\s${name}="([^"]*)"`, "i"))?.[1];
  if (!value) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getRootSize(svg) {
  const root = getFirstNodeSlice(svg);
  const hover = root.match(/<rect\b(?=[^>]*\bclass="[^"]*\bsmm-hover-node\b[^"]*")[^>]*>/i);
  if (hover) {
    const width = getNumberAttr(hover[0], "width");
    const height = getNumberAttr(hover[0], "height");
    if (width && height) {
      return { width, height };
    }
  }
  const textBox = root.match(/<g\b(?=[^>]*\bdata-width="[^"]+")[^>]*\bdata-height="[^"]+"[^>]*>/i);
  if (textBox) {
    const width = getNumberAttr(textBox[0], "data-width");
    const height = getNumberAttr(textBox[0], "data-height");
    if (width && height) {
      return { width: width + 36, height: height + 16 };
    }
  }
  return { width: 154, height: 45 };
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

function nativeCard(svg, expand = 0) {
  const svgW = Number.parseFloat(getSvgAttr(svg, "width"));
  const svgH = Number.parseFloat(getSvgAttr(svg, "height"));
  const points = getNodePoints(svg);
  const root = points[0] ?? { x: 0, y: svgH / 2 };
  const vw = Math.min(svgW, svgH * ASPECT * (1 + expand));
  const vh = vw / ASPECT;
  let vx = svgW / 2 - vw / 2;
  const rootInVp = root.x - vx;
  const minRoot = vw * 0.04;
  const maxRoot = vw * 0.25;
  if (rootInVp < minRoot) {
    vx = root.x - minRoot;
  } else if (rootInVp > maxRoot) {
    vx = root.x - maxRoot;
  }
  vx = clamp(vx, 0, Math.max(svgW - vw, 0));
  return setOrAddSvgAttr(svg, "viewBox", `${vx} 0 ${vw} ${vh}`);
}

function rootReadable(svg, rootRatio, expand) {
  const svgW = Number.parseFloat(getSvgAttr(svg, "width"));
  const svgH = Number.parseFloat(getSvgAttr(svg, "height"));
  const points = getNodePoints(svg);
  const root = points[0] ?? { x: 0, y: svgH / 2 };
  const rootSize = getRootSize(svg);
  const vw = Math.min(svgW, (rootSize.width / rootRatio) * (1 + expand));
  const vh = vw / ASPECT;
  let vx = svgW / 2 - vw / 2;
  const rootInVp = root.x - vx;
  const minRoot = vw * 0.04;
  const maxRoot = vw * 0.25;
  if (rootInVp < minRoot) {
    vx = root.x - minRoot;
  } else if (rootInVp > maxRoot) {
    vx = root.x - maxRoot;
  }
  vx = clamp(vx, 0, Math.max(svgW - vw, 0));
  const vy = clamp(root.y - vh / 2, 0, Math.max(svgH - vh, 0));
  return setOrAddSvgAttr(svg, "viewBox", `${vx} ${vy} ${vw} ${vh}`);
}

function variantMetric(svg) {
  const [vx, vy, vw, vh] = getSvgAttr(svg, "viewBox").split(/\s+/).map(Number);
  return { vx, vy, vw, vh };
}

const sourcePath = join(OUTPUT, "native-normalized.svg");
if (!existsSync(sourcePath)) {
  throw new Error(`Missing ${sourcePath}. Run experiment.mjs first.`);
}

const sourceSvg = readFileSync(sourcePath, "utf8");
const variants = [
  {
    id: "01-native-card",
    title: "Native Card 原版",
    note: "实验版原始做法：整体重心裁剪，根节点限制在左 4%-25%。",
    svg: nativeCard(sourceSvg, 0),
  },
  {
    id: "02-native-card-10",
    title: "Native Card +10%",
    note: "沿用 Native Card，仅把视野宽高放大 10%。",
    svg: nativeCard(sourceSvg, 0.1),
  },
  {
    id: "03-native-card-25",
    title: "Native Card +25%",
    note: "沿用 Native Card，仅把视野宽高放大 25%。",
    svg: nativeCard(sourceSvg, 0.25),
  },
  {
    id: "04-root-readable-20-10",
    title: "根节点可读 20% +10%",
    note: "以根节点占视口宽约 20% 为基准，允许上下裁剪，再放大 10%。",
    svg: rootReadable(sourceSvg, 0.2, 0.1),
  },
  {
    id: "05-root-readable-18-25",
    title: "根节点可读 18% +25%",
    note: "以根节点占视口宽约 18% 为基准，允许上下裁剪，再放大 25%。",
    svg: rootReadable(sourceSvg, 0.18, 0.25),
  },
];

for (const item of variants) {
  const svg = patchForCard(item.svg);
  item.svg = svg;
  item.metrics = variantMetric(svg);
  writeFileSync(join(VARIANT_DIR, `${item.id}.svg`), svg, "utf8");
}

const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>MindMap Preview Variants</title>
  <style>
    body { margin: 0; padding: 24px; background: #e5e7eb; font-family: system-ui, sans-serif; color: #111827; }
    h1 { font-size: 18px; margin: 0 0 16px; }
    .grid { display: grid; grid-template-columns: repeat(2, max-content); gap: 22px; align-items: start; }
    .item { background: #fff; border-radius: 14px; padding: 12px; box-shadow: 0 4px 14px rgba(15, 23, 42, .14); }
    .card { width: ${CARD_W}px; height: ${CARD_H}px; overflow: hidden; border-radius: 10px; background: #f1f1f1; border: 1px solid #d1d5db; }
    .card svg { display: block; width: 100%; height: 100%; }
    .title { font-size: 13px; font-weight: 700; margin: 10px 0 4px; }
    .note { font-size: 12px; line-height: 1.45; color: #4b5563; max-width: ${CARD_W}px; }
    .metric { font-size: 11px; color: #6b7280; margin-top: 5px; }
  </style>
</head>
<body>
  <h1>MindMap 缩略图候选预览</h1>
  <div class="grid">
    ${variants.map((item) => `<section class="item" id="${item.id}">
      <div class="card">${item.svg}</div>
      <div class="title">${item.id} · ${item.title}</div>
      <div class="note">${item.note}</div>
      <div class="metric">viewBox: ${Object.values(item.metrics).map((v) => Number(v).toFixed(1)).join(" ")}</div>
    </section>`).join("\n")}
  </div>
</body>
</html>`;

const htmlPath = join(VARIANT_DIR, "preview-variants.html");
writeFileSync(htmlPath, html, "utf8");

const browser = await chromium.launch({
  headless: true,
  executablePath: "/root/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
try {
  const page = await browser.newPage({ viewport: { width: 980, height: 980 }, deviceScaleFactor: 1 });
  await page.goto(`file://${htmlPath}`);
  await page.screenshot({ path: join(VARIANT_DIR, "all-variants.png"), fullPage: true });
  for (const item of variants) {
    const locator = page.locator(`[id="${item.id}"] .card`);
    await locator.screenshot({ path: join(VARIANT_DIR, `${item.id}.png`) });
  }
} finally {
  await browser.close();
}

writeFileSync(
  join(VARIANT_DIR, "summary.json"),
  JSON.stringify(
    variants.map(({ id, title, note, metrics }) => ({ id, title, note, metrics })),
    null,
    2,
  ),
  "utf8",
);

console.log(`Generated ${variants.length} variants in ${VARIANT_DIR}`);
for (const item of variants) {
  console.log(`${item.id}: ${item.title} -> ${join(VARIANT_DIR, `${item.id}.png`)}`);
}
