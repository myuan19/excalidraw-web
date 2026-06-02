import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const d = dirname(fileURLToPath(import.meta.url));
const sample = readFileSync(join(d, "sample.mermaid"), "utf8").trim();
const server = await createServer({ configFile: join(d, "vite.config.mts") });
await server.listen();
const port = server.config.server.port ?? 5199;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction(() => window.__COMPARE_READY__);

const dump = await page.evaluate(async (mermaidText) => {
  const { parseMermaidToExcalidraw } = await import(
    "@excalidraw/mermaid-to-excalidraw"
  );
  const { convertToExcalidrawElements } = await import("@excalidraw/element");
  const parsed = await parseMermaidToExcalidraw(mermaidText);
  const converted = convertToExcalidrawElements(parsed.elements, {
    regenerateIds: true,
  });
  return converted
    .filter((e) => e.type === "arrow")
    .map((e) => ({
      id: e.id,
      pointCount: e.points.length,
      points: e.points.map((p) => [Math.round(p[0]), Math.round(p[1])]),
      start: e.startBinding?.elementId,
      end: e.endBinding?.elementId,
    }));
}, sample);

writeFileSync(join(d, "output/arrows-raw.json"), JSON.stringify(dump, null, 2));
console.log(JSON.stringify(dump, null, 2));
await browser.close();
await server.close();
