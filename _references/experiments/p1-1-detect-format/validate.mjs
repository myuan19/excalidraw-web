import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function detectFormat(file) {
  const name = file.name.toLowerCase();
  const type = file.type || "";
  let json = null;
  try {
    json = typeof file.text === "string" ? JSON.parse(file.text) : null;
  } catch {
    json = null;
  }

  if (json?.kind === "excalidraw") {
    return "excalidraw";
  }
  if (json?.kind === "mindmap") {
    return "mindmap";
  }
  if (json?.type === "excalidraw" || name.endsWith(".excalidraw")) {
    return "excalidraw";
  }
  if (
    name.endsWith(".smm") ||
    (json?.root && json?.layout && json?.theme && json?.view)
  ) {
    return "mindmap";
  }
  if (type === "text/markdown" || name.endsWith(".md")) {
    return "markdown";
  }
  return "unknown";
}

const cases = [
  {
    name: "scene.excalidraw",
    type: "application/vnd.excalidraw+json",
    text: JSON.stringify({ type: "excalidraw", elements: [] }),
    expected: "excalidraw",
  },
  {
    name: "wrapped.json",
    type: "application/json",
    text: JSON.stringify({ kind: "mindmap", data: { root: {} } }),
    expected: "mindmap",
  },
  {
    name: "map.smm",
    type: "application/json",
    text: JSON.stringify({
      layout: "mindMap",
      root: {},
      theme: {},
      view: {},
    }),
    expected: "mindmap",
  },
  {
    name: "random.json",
    type: "application/json",
    text: JSON.stringify({ hello: "world" }),
    expected: "unknown",
  },
  {
    name: "notes.md",
    type: "text/markdown",
    text: "# Notes",
    expected: "markdown",
  },
];

const results = cases.map((item) => ({
  name: item.name,
  expected: item.expected,
  actual: detectFormat(item),
  ok: detectFormat(item) === item.expected,
}));

const result = {
  id: "P1-1",
  title: "格式识别 detectFormat(file)",
  conclusion: results.every((item) => item.ok) ? "PASS" : "FAIL",
  cases: results,
  recommendation:
    "Prefer JSON kind/type when available, then extension-specific fallbacks. Treat generic .json as unknown unless shape is recognized.",
};

writeFileSync(join(__dirname, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(`${result.id} ${result.conclusion}`);
