/**
 * 使用 Playwright + 原生 simple-mind-map 重新生成所有 mindmap 的缩略图。
 * 修复之前 atob() 解码 UTF-8 导致中文乱码的问题。
 *
 * 用法: node scripts/regenerate-mindmap-thumbnails.mjs
 */
import { chromium } from "playwright";
import {
  createServer,
} from "node:http";
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { extname, join } from "node:path";

const MIND_MAP_DIR = join(process.cwd(), "mind-map");
const FILES_ROOT = join(process.cwd(), "server/data/files");
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || null;

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
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(readFileSync(filePath));
  });
}

function collectMindMapFiles() {
  const results = [];
  if (!existsSync(FILES_ROOT)) return results;
  for (const fileId of readdirSync(FILES_ROOT)) {
    const currentPath = join(FILES_ROOT, fileId, "current.excalidraw");
    if (!existsSync(currentPath)) continue;
    try {
      const raw = JSON.parse(readFileSync(currentPath, "utf8"));
      if (raw.kind === "mindmap") {
        results.push({ fileId, currentPath, data: raw.data });
      }
    } catch {
      continue;
    }
  }
  return results;
}

async function exportNativeSvg(page, baseUrl, mindMapData) {
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "load" });
  await page.waitForFunction(
    () => typeof window.$bus !== "undefined" && typeof window.initApp === "function",
    { timeout: 15000, polling: 100 },
  );

  await page.evaluate(() => {
    window.__mm = null;
    window.$bus.$on("app_inited", (mindMap) => {
      window.__mm = mindMap;
    });
  });

  const initPayload = { mindMapData, mindMapConfig: {}, lang: "zh", localConfig: null };
  await page.evaluate((payload) => {
    window.postMessage({ source: "excalidraw-web", type: "initMindMap", payload }, "*");
  }, initPayload);

  await page.waitForFunction(() => window.__mm !== null, { timeout: 30000, polling: 200 });
  await page.waitForTimeout(1500);

  const dataUrl = await page.evaluate(async () => {
    return await window.__mm.export("svg", false, "MindMap");
  });

  if (!dataUrl) return null;

  const commaIdx = dataUrl.indexOf(",");
  const meta = dataUrl.slice(0, commaIdx);
  const body = dataUrl.slice(commaIdx + 1);
  if (meta.includes(";base64")) {
    return Buffer.from(body, "base64").toString("utf8");
  }
  return decodeURIComponent(body);
}

// ---------- main ----------

const mindMaps = collectMindMapFiles();
if (mindMaps.length === 0) {
  console.log("No mindmap files found.");
  process.exit(0);
}
console.log(`Found ${mindMaps.length} mindmap file(s).`);

const server = serveStatic(MIND_MAP_DIR);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}`;

const launchOpts = { headless: true };
if (CHROMIUM_PATH) launchOpts.executablePath = CHROMIUM_PATH;
const browser = await chromium.launch(launchOpts);

let regenerated = 0;
let failed = 0;

for (const { fileId, data } of mindMaps) {
  const id8 = fileId.slice(0, 8);
  const thumbPath = join(FILES_ROOT, fileId, "thumbnail.svg");
  try {
    const page = await browser.newPage();
    const svg = await exportNativeSvg(page, baseUrl, data);
    await page.close();
    if (svg) {
      writeFileSync(thumbPath, svg, "utf8");
      regenerated++;
      console.log(`  [OK] ${id8} → ${svg.length} bytes`);
    } else {
      failed++;
      console.log(`  [SKIP] ${id8}: export returned null`);
    }
  } catch (err) {
    failed++;
    console.error(`  [FAIL] ${id8}: ${err.message}`);
  }
}

await browser.close();
server.close();

console.log(`\nDone: regenerated=${regenerated} failed=${failed}`);
