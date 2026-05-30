import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { extname } from "node:path";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, "output");
const MIND_MAP_DIR = join(__dirname, "../../mind-map");

// ---------- 读取 mindmap 数据 ----------

const dataPath = join(
  __dirname,
  "../../server/data/files/fdddd582-dc41-48e8-848d-845ca188f26b/current.excalidraw",
);
const rawData = JSON.parse(readFileSync(dataPath, "utf8"));

console.log("=== MindMap 数据 ===");
console.log(`kind: ${rawData.kind}, layout: ${rawData.data.layout}`);
console.log(`theme: ${rawData.data.theme?.template}`);

// 构造 initMindMap payload（与 MindMapEditorShell 一致）
const initPayload = {
  mindMapData: rawData.data,
  mindMapConfig: {},
  lang: "zh",
  localConfig: null,
};

// ---------- 简易静态文件服务器 ----------

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
};

function serveStatic(baseDir) {
  return createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    let filePath = join(baseDir, decodeURIComponent(url.pathname));
    if (filePath.endsWith("/")) filePath += "index.html";
    if (!existsSync(filePath)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = extname(filePath).toLowerCase();
    const ct = MIME[ext] || "application/octet-stream";
    const data = readFileSync(filePath);
    res.writeHead(200, { "Content-Type": ct });
    res.end(data);
  });
}

// ---------- 主流程 ----------

const server = serveStatic(MIND_MAP_DIR);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}`;
console.log(`\n=== 静态服务器 ${baseUrl} ===`);

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: "/root/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
  });
  const page = await browser.newPage();

  // 监听控制台输出
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("mindmap-open") || text.includes("Error") || text.includes("thumbnail")) {
      console.log(`  [browser] ${text}`);
    }
  });
  page.on("pageerror", (err) => console.error(`  [pageerror] ${err.message}`));

  console.log("\n=== 加载 mind-map 页面 ===");
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "load" });
  console.log("  页面 loaded");

  // 等待 bridge 准备好（window.takeOverApp 已设置）
  await page.waitForFunction(() => window.takeOverApp === true, { timeout: 10000 });
  console.log("  takeOverApp = true");

  // 等待 Vue app 及 $bus 初始化完成
  await page.waitForFunction(() => typeof window.$bus !== "undefined" && typeof window.initApp === "function", {
    timeout: 15000,
    polling: 100,
  });
  console.log("  $bus 和 initApp 就绪");

  // 通过 $bus 注册 app_inited 监听，直接拿到 mindmap 实例
  await page.evaluate(() => {
    window.__mm = null;
    window.$bus.$on("app_inited", (mindMap) => {
      window.__mm = mindMap;
    });
  });

  // 发送 initMindMap 消息（模拟宿主）
  console.log("\n=== 发送 initMindMap ===");
  await page.evaluate((payload) => {
    window.postMessage(
      {
        source: "excalidraw-web",
        type: "initMindMap",
        payload,
      },
      "*",
    );
  }, initPayload);

  // 等待 mindmap 实例就绪
  console.log("  等待 __mm 实例...");
  await page.waitForFunction(() => window.__mm !== null, {
    timeout: 30000,
    polling: 200,
  });
  console.log("  MindMap 实例就绪");

  // 等待渲染完成
  await page.waitForTimeout(2000);

  // 通过原生 export 导出 SVG
  console.log("\n=== 调用 nativeMindMap.export('svg') ===");
  const finalDataUrl = await page.evaluate(async () => {
    return await window.__mm.export("svg", false, "MindMap");
  });

  if (!finalDataUrl) {
    throw new Error("SVG export returned null");
  }

  console.log(`  data URL 长度: ${finalDataUrl.length}`);
  console.log(`  前缀: ${finalDataUrl.slice(0, 80)}...`);

  // 解码 data URL → SVG 字符串
  const commaIdx = finalDataUrl.indexOf(",");
  const meta = finalDataUrl.slice(0, commaIdx);
  const body = finalDataUrl.slice(commaIdx + 1);
  let svgStr;
  if (meta.includes(";base64")) {
    svgStr = Buffer.from(body, "base64").toString("utf8");
  } else {
    svgStr = decodeURIComponent(body);
  }

  console.log(`  SVG 字符串长度: ${svgStr.length}`);
  console.log(`  前100字符: ${svgStr.slice(0, 100)}`);

  // 保存原始导出 SVG
  writeFileSync(join(OUTPUT, "native-export.svg"), svgStr, "utf8");
  console.log(`\n  → output/native-export.svg (原始导出)`);

  // 应用 normalizeMindMapThumbnailSvg 处理
  function sanitizeThumbnailSvg(s) {
    return s
      .replace(/<style\b[^>]*class="style-fonts"[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?@font-face[\s\S]*?<\/style>/gi, "");
  }

  function decodeXmlTextEntities(v) {
    return v.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }
  function escapeXmlText(v) {
    return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function richTextToPlain(v) {
    return decodeXmlTextEntities(v).replace(/<br\s*\/?>/gi, "\n").replace(/<\/p\s*>/gi, "\n").replace(/<[^>]*>/g, "").replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{2,}/g, "\n").trim();
  }
  function normalizeTextNodes(s) {
    return s.replace(/(<text\b[^>]*>)([\s\S]*?)(<\/text>)/gi, (_m, open, text, close) =>
      `${open}${escapeXmlText(richTextToPlain(text))}${close}`
    );
  }

  let normalized = sanitizeThumbnailSvg(svgStr).replace(/^\uFEFF/, "").trim();
  if (/<svg\b/i.test(normalized)) {
    if (!/\sxmlns=/.test(normalized.match(/<svg\b[^>]*>/i)?.[0] || "")) {
      normalized = normalized.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    normalized = normalizeTextNodes(normalized);
  }
  writeFileSync(join(OUTPUT, "native-normalized.svg"), normalized, "utf8");
  console.log(`  → output/native-normalized.svg (normalize 后)`);

  // ---------- 裁剪 viewBox：重心居中，根节点不超过左 1/4 ----------
  function getSvgAttr(svg, name) {
    return svg.match(new RegExp(`\\s${name}="([^"]*)"`, "i"))?.[1] ?? "";
  }
  function setOrAddSvgAttr(svg, name, value) {
    const openTag = svg.match(/<svg\b[^>]*>/i)?.[0] ?? "";
    if (!openTag) return svg;
    const attrRe = new RegExp(`\\s${name}="[^"]*"`, "i");
    if (attrRe.test(openTag)) {
      return svg.replace(attrRe, ` ${name}="${value}"`);
    }
    return svg.replace(/<svg\b/i, `<svg ${name}="${value}"`);
  }

  function cropMindMapViewBox(svg) {
    const svgW = parseFloat(getSvgAttr(svg, "width"));
    const svgH = parseFloat(getSvgAttr(svg, "height"));
    if (!isFinite(svgW) || !isFinite(svgH) || svgW <= 0 || svgH <= 0) return svg;

    const TARGET_ASPECT = 5 / 3;
    if (svgW / svgH <= TARGET_ASPECT) return svg;

    const containerMatch = svg.match(
      /class="smm-container"\s+transform="matrix\([^,]+,[^,]+,[^,]+,[^,]+,([^,]+),([^)]+)\)"/,
    );
    const rootNodeMatch = svg.match(
      /class="smm-node"\s+transform="matrix\([^,]+,[^,]+,[^,]+,[^,]+,([^,]+),([^)]+)\)"/,
    );

    let rootSvgX = 0;
    if (containerMatch && rootNodeMatch) {
      rootSvgX = parseFloat(rootNodeMatch[1]) + parseFloat(containerMatch[1]);
    }

    const vh = svgH;
    const vw = vh * TARGET_ASPECT;
    const contentCx = svgW / 2;
    let vx = contentCx - vw / 2;

    const rootInVp = rootSvgX - vx;
    const MIN_ROOT = vw * 0.04;
    const MAX_ROOT = vw * 0.25;
    if (rootInVp < MIN_ROOT) vx = rootSvgX - MIN_ROOT;
    else if (rootInVp > MAX_ROOT) vx = rootSvgX - MAX_ROOT;

    if (vx < 0) vx = 0;
    if (vx + vw > svgW) vx = svgW - vw;
    if (vx < 0) vx = 0;

    console.log(`  裁剪: viewBox="${vx.toFixed(1)} 0 ${vw.toFixed(1)} ${vh}" | root在${((rootSvgX-vx)/vw*100).toFixed(1)}%`);
    return setOrAddSvgAttr(svg, "viewBox", `${vx} 0 ${vw} ${vh}`);
  }

  const cropped = cropMindMapViewBox(normalized);
  writeFileSync(join(OUTPUT, "native-cropped.svg"), cropped, "utf8");
  console.log(`  → output/native-cropped.svg (裁剪后)`);

  // patchThumbnailSvgForCard（基于裁剪后的版本）
  const cardSvg = cropped.replace(
    /(<svg\b)((?:\s+[a-z][a-z0-9-]*(?:="[^"]*")?)*?)(\s*>)/i,
    (_m, open, attrs, close) => {
      const cleaned = attrs
        .replace(/\s+preserveAspectRatio="[^"]*"/i, "")
        .replace(/\s+width="[^"]*"/i, "")
        .replace(/\s+height="[^"]*"/i, "");
      return `${open}${cleaned} preserveAspectRatio="xMidYMid meet" width="100%" height="100%"${close}`;
    },
  );
  writeFileSync(join(OUTPUT, "native-card.svg"), cardSvg, "utf8");
  console.log(`  → output/native-card.svg (card patch 后)`);

  // HTML 预览
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>MindMap 原生预览实验</title>
<style>
body{font-family:sans-serif;padding:24px;background:#f0f0f0}
h1{font-size:18px;color:#333}
h2{font-size:14px;color:#666;margin-top:24px}
.card{background:white;padding:16px;border-radius:12px;margin:12px 0;box-shadow:0 2px 8px rgba(0,0,0,.1);overflow:auto}
.card svg{display:block;max-width:100%;border:1px solid #e0e0e0;border-radius:8px}
.card-sim{width:280px;height:168px;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)}
.info{font-size:12px;color:#999;margin-top:4px}
</style></head><body>
<h1>MindMap 原生预览图实验 (p1-9)</h1>

<h2>1. 原生导出 SVG (native-export.svg)</h2>
<div class="card">${svgStr}</div>
<p class="info">${svgStr.length} bytes</p>

<h2>2. normalize 后 (native-normalized.svg)</h2>
<div class="card">${normalized}</div>
<p class="info">${normalized.length} bytes</p>

<h2>3. 裁剪后 (native-cropped.svg)</h2>
<div class="card">${cropped}</div>
<p class="info">viewBox 裁剪：重心居中，根节点不超过左1/4</p>

<h2>4. 卡片模式 (native-card.svg, 280x168)</h2>
<div class="card-sim">${cardSvg}</div>
<p class="info">patchThumbnailSvgForCard 处理后</p>

</body></html>`;
  writeFileSync(join(OUTPUT, "preview.html"), html, "utf8");
  console.log(`  → output/preview.html`);

} catch (err) {
  console.error("\n!!! 实验失败:", err.message);
  console.error(err.stack);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.close();
}

console.log("\n=== 实验完成 ===");
