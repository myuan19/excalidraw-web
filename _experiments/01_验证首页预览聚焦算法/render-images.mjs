import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "../p1-9-mindmap-preview-fix/node_modules/playwright/index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, "output");
const HTML_PATH = join(OUTPUT, "preview-focus-experiment.html");
const SUMMARY_PATH = join(OUTPUT, "summary.json");
const IMAGE_DIR = join(OUTPUT, "images");
const CHROME_PATH = "/root/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome";

if (!existsSync(HTML_PATH) || !existsSync(SUMMARY_PATH)) {
  throw new Error("Missing experiment output. Run bash run.sh first.");
}

rmSync(IMAGE_DIR, { recursive: true, force: true });
mkdirSync(IMAGE_DIR, { recursive: true });

const summary = JSON.parse(readFileSync(SUMMARY_PATH, "utf8"));
const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME_PATH,
});

try {
  const page = await browser.newPage({
    viewport: { width: 1660, height: 1200 },
    deviceScaleFactor: 1,
  });
  await page.goto(pathToFileURL(HTML_PATH).href, { waitUntil: "load" });
  await page.screenshot({
    path: join(IMAGE_DIR, "all-preview-focus-variants.png"),
    fullPage: true,
  });

  for (const item of summary) {
    await page.locator(`[id="${item.id}"]`).screenshot({
      path: join(IMAGE_DIR, `${item.id}__compare.png`),
    });
    await page.locator(`[id="${item.id}"] .compare > div:nth-child(2) .card`).screenshot({
      path: join(IMAGE_DIR, `${item.id}__focused-card.png`),
    });
  }
} finally {
  await browser.close();
}

console.log(`生成图片目录: ${IMAGE_DIR}`);
console.log(`总览图: ${join(IMAGE_DIR, "all-preview-focus-variants.png")}`);
console.log(`单样例数量: ${summary.length}`);
