import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, "output");
mkdirSync(OUTPUT, { recursive: true });

const server = await createServer({
  configFile: join(__dirname, "vite.config.mts"),
});
await server.listen();
const port = server.config.server.port ?? 5199;

const sample = readFileSync(join(__dirname, "sample.mermaid"), "utf8").trim();

const mod = await server.ssrLoadModule("/main.ts").catch(() => null);

// SSR won't work; use browser evaluate via playwright
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });

await page.waitForFunction(() => window.__COMPARE_READY__);

const report = await page.evaluate(async (mermaidText) => {
  const { parseMermaidToExcalidraw } = await import(
    "@excalidraw/mermaid-to-excalidraw"
  );
  const { convertToExcalidrawElements } = await import("@excalidraw/element");
  const parsed = await parseMermaidToExcalidraw(mermaidText);
  const converted = convertToExcalidrawElements(parsed.elements, {
    regenerateIds: true,
  });

  const arrows = converted
    .filter((e) => e.type === "arrow" || e.type === "line")
    .map((e) => ({
      id: e.id,
      type: e.type,
      pointCount: e.points?.length ?? 0,
      elbowed: e.elbowed ?? null,
      roundness: e.roundness ?? null,
      startBinding: e.startBinding?.elementId ?? null,
      endBinding: e.endBinding?.elementId ?? null,
    }));

  const labels = converted
    .filter((e) => e.type === "text")
    .map((e) => ({ id: e.id, text: e.text?.slice?.(0, 40) }));

  const nodes = converted
    .filter((e) => e.type !== "arrow" && e.type !== "line" && e.type !== "text")
    .map((e) => ({ id: e.id, type: e.type, label: e.text?.slice?.(0, 30) }));

  return { arrowCount: arrows.length, arrows, labels, nodes };
}, sample);

writeFileSync(join(OUTPUT, "inspect.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
await server.close();
