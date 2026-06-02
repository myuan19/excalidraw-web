/**
 * 在真实 Chromium 中跑完整 TTD 管线（exportToCanvas），再截 PNG。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { createServer } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, "output");
const CONFIG = join(__dirname, "vite.config.mts");

mkdirSync(OUTPUT, { recursive: true });

const server = await createServer({ configFile: CONFIG });
await server.listen();
const port = server.config.server.port ?? 5199;
const url = `http://127.0.0.1:${port}/`;

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 2400, height: 1600 },
    deviceScaleFactor: 2,
  });
  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForFunction(() => window.__COMPARE_READY__ === true, {
    timeout: 120_000,
  });

  const meta = await page.evaluate(() => window.__COMPARE_META__);

  const gitHeadPng = join(OUTPUT, "git-head-connectors.png");
  const sharpPng = join(OUTPUT, "sharp-connectors.png");
  const currentPng = join(OUTPUT, "current-connectors.png");
  const comparePng = join(OUTPUT, "compare-side-by-side.png");

  await page.locator("#git-head").screenshot({ path: gitHeadPng });
  await page.locator("#sharp").screenshot({ path: sharpPng });
  await page.locator("#current").screenshot({ path: currentPng });
  await page.locator(".row").screenshot({ path: comparePng });

  for (const p of [gitHeadPng, sharpPng, currentPng, comparePng]) {
    const { size } = await import("node:fs").then((fs) => ({
      size: fs.statSync(p).size,
    }));
    if (size < 5000) {
      throw new Error(`PNG 异常偏小: ${p} (${size} bytes)`);
    }
    console.log(p, size, "bytes");
  }

  writeFileSync(
    join(OUTPUT, "meta.json"),
    JSON.stringify(
      {
        ...meta,
        compareNote:
          "① Git HEAD 无后处理 ② 去掉 roundness ③ ②走线+render-only局部圆角",
        pipeline:
          "browser: parseMermaid → convertToExcalidrawElements → [variant] → exportToCanvas",
        renderUrl: url,
        pngOutputs: { gitHeadPng, sharpPng, currentPng, comparePng },
      },
      null,
      2,
    ),
  );

  console.log("[ttd-connector-compare] 完成:", comparePng);
} finally {
  await browser.close();
  await server.close();
}
