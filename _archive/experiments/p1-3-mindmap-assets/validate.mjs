import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const mindMapRoot = "/root/projects/archive/mind-map";

const files = {
  nodeImageStorage: "simple-mind-map/src/plugins/NodeBase64ImageStorage.js",
  mindMapNode: "simple-mind-map/src/core/render/node/MindMapNode.js",
  exportPlugin: "simple-mind-map/src/plugins/Export.js",
  defaultOptions: "simple-mind-map/src/constants/defaultOptions.js",
};

const sources = Object.fromEntries(
  Object.entries(files).map(([key, rel]) => [
    key,
    readFileSync(join(mindMapRoot, rel), "utf8"),
  ]),
);

const sample = {
  layout: "mindMap",
  root: {
    data: {
      text: "Root",
      image: "data:image/png;base64,AAAA",
      note: "note",
      hyperlink: "https://example.com",
      icon: ["priority_1"],
      tag: ["demo"],
    },
    children: [],
  },
  theme: { template: "default", config: {} },
  view: { scale: 1, x: 0, y: 0 },
};
const sampleRoundtrip = JSON.parse(JSON.stringify(sample));

const checks = {
  nodeBase64ImagePluginExists: sources.nodeImageStorage.includes("Base64"),
  nodeDataMentionsImage: sources.mindMapNode.includes("image"),
  nodeDataMentionsNote: sources.mindMapNode.includes("note"),
  nodeDataMentionsHyperlink: sources.mindMapNode.includes("hyperlink"),
  exportPluginSerializesJson:
    sources.exportPlugin.includes("JSON.stringify") &&
    sources.exportPlugin.includes("getData"),
  sampleInlineImagePreserved:
    sampleRoundtrip.root.data.image === sample.root.data.image,
};

const result = {
  id: "P1-3",
  title: "MindMap 图片与附件存储",
  conclusion:
    checks.nodeDataMentionsImage &&
    checks.exportPluginSerializesJson &&
    checks.sampleInlineImagePreserved
      ? "PARTIAL_PASS"
      : "FAIL",
  checks,
  blocker:
    "This static validation confirms JSON can preserve inline image references. A browser validation is still needed for remote URLs, image upload plugin behavior, and export rendering.",
  recommendation:
    "For MVP, require inline/base64 images or stable URLs inside MindMap payload. If external attachments are needed, introduce a format-level files map similar to Excalidraw files.",
};

writeFileSync(join(__dirname, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(`${result.id} ${result.conclusion}`);
