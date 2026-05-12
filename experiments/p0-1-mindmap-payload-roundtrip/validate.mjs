import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const adapterPath = path.join(
  repoRoot,
  "excalidraw-app/data/formats/MindMapAdapter.ts",
);
const shellPath = path.join(repoRoot, "excalidraw-app/MindMapEditorShell.tsx");
const nativeIndexPath = path.join(repoRoot, "mind-map/web/public/index.html");
const adapterSource = readFileSync(adapterPath, "utf8");
const shellSource = readFileSync(shellPath, "utf8");
const nativeIndexSource = readFileSync(nativeIndexPath, "utf8");

const checks = [
  {
    name: "MindMapAdapter defines full data with root",
    pass: /export type MindMapDocumentData[\s\S]*root: MindMapNode/.test(
      adapterSource,
    ),
  },
  {
    name: "MindMapAdapter empty document includes layout/theme",
    pass:
      /layout:\s*"logicalStructure"/.test(adapterSource) &&
      /theme:\s*\{[\s\S]*template:\s*"default"/.test(adapterSource),
  },
  {
    name: "Native MindMap bridge reads full data via getData(true)",
    pass: /getData\(true\)/.test(nativeIndexSource),
  },
  {
    name: "MindMapEditorShell restores full data through initMindMap bridge",
    pass:
      /initMindMap/.test(shellSource) &&
      /toBridgePayload/.test(shellSource) &&
      /mindMapData/.test(nativeIndexSource),
  },
];

const result = {
  id: "P0-1",
  title: "MindMap 独立 payload 保存与恢复",
  status: checks.every((check) => check.pass) ? "PASS" : "FAIL",
  checks,
};

mkdirSync(__dirname, { recursive: true });
writeFileSync(
  path.join(__dirname, "result.json"),
  JSON.stringify(result, null, 2),
);

if (result.status !== "PASS") {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(`${result.id} ${result.status}`);
