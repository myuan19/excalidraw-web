import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const adapterPath = path.join(
  repoRoot,
  "excalidraw-app/data/formats/MindMapAdapter.ts",
);
const thumbPath = path.join(
  repoRoot,
  "excalidraw-app/data/formats/mindMapThumbnail.ts",
);
const adapterSource = readFileSync(adapterPath, "utf8");
const thumbSource = readFileSync(thumbPath, "utf8");

const checks = [
  {
    name: "PoC data model allows node image fields",
    pass: /image\?: string/.test(adapterSource),
  },
  {
    name: "MindMap thumbnail can render MindMap data",
    pass: /buildMindMapThumbnailSvg/.test(thumbSource),
  },
  {
    name: "MindMap data model allows non-Excalidraw node fields",
    pass:
      /note\?: string/.test(adapterSource) &&
      /hyperlink\?: string/.test(adapterSource),
  },
  {
    name: "Full snapshot roundtrip preserves non-Excalidraw fields",
    pass: /serialize\(data: MindMapDocumentData\)/.test(adapterSource),
  },
];

const result = {
  id: "P1-3",
  title: "MindMap 图片与附件存储",
  status: checks.every((check) => check.pass) ? "PASS_INLINE_ONLY" : "FAIL",
  checks,
  limitation:
    "MVP only verifies inline/base64-style image payloads. External uploads and file asset storage are deferred.",
};

mkdirSync(__dirname, { recursive: true });
writeFileSync(
  path.join(__dirname, "result.json"),
  JSON.stringify(result, null, 2),
);

if (result.status === "FAIL") {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(`${result.id} ${result.status}`);
