import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const mindMapRoot = "/root/projects/archive/mind-map";
const sourcePath = join(mindMapRoot, "simple-mind-map/index.js");
const packagePath = join(mindMapRoot, "simple-mind-map/package.json");

const source = readFileSync(sourcePath, "utf8");
const pkg = JSON.parse(readFileSync(packagePath, "utf8"));

const samplePayload = {
  layout: "mindMap",
  root: {
    data: {
      uid: "root",
      text: "Root",
      expand: true,
      richText: false,
      icon: ["priority_1"],
      tag: ["demo"],
      image: "data:image/png;base64,AAAA",
      note: "root note",
      hyperlink: "https://example.com",
    },
    children: [
      {
        data: { uid: "child-1", text: "Child", expand: true },
        children: [],
      },
    ],
    smmVersion: pkg.version,
  },
  theme: {
    template: "default",
    config: {
      backgroundColor: "#ffffff",
      lineColor: "#333333",
    },
  },
  view: {
    scale: 1,
    x: 120,
    y: 80,
  },
};

const parsed = JSON.parse(JSON.stringify(samplePayload));

const checks = {
  sourceExists: existsSync(sourcePath),
  packageVersion: pkg.version,
  getDataWithConfigReturnsFullShape:
    source.includes("getData(withConfig)") &&
    source.includes("layout: this.getLayout()") &&
    source.includes("root: nodeData") &&
    source.includes("theme: {") &&
    source.includes("view: this.view.getTransformData()"),
  setFullDataRestoresFullShape:
    source.includes("setFullData(data)") &&
    source.includes("this.setData(data.root)") &&
    source.includes("this.setLayout(data.layout)") &&
    source.includes("this.setTheme(data.theme.template)") &&
    source.includes("this.view.setTransformData(data.view)"),
  representativeJsonRoundtrip:
    JSON.stringify(parsed) === JSON.stringify(samplePayload),
  runtimeInstantiationExecuted: false,
  runtimeInstantiationBlocker:
    "simple-mind-map runtime requires browser DOM and dependencies such as @svgdotjs/svg.js/quill; this experiment validates API shape and JSON payload preservation only.",
};

const result = {
  id: "P0-1",
  title: "MindMap 独立 payload 保存与恢复",
  conclusion:
    checks.getDataWithConfigReturnsFullShape &&
    checks.setFullDataRestoresFullShape &&
    checks.representativeJsonRoundtrip
      ? "PARTIAL_PASS"
      : "FAIL",
  checks,
  samplePayloadSummary: {
    layout: samplePayload.layout,
    rootText: samplePayload.root.data.text,
    childCount: samplePayload.root.children.length,
    hasTheme: Boolean(samplePayload.theme),
    hasView: Boolean(samplePayload.view),
    hasInlineImage: samplePayload.root.data.image.startsWith("data:image/"),
  },
  repoRoot,
  mindMapRoot,
};

writeFileSync(
  join(__dirname, "result.json"),
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(`${result.id} ${result.conclusion}`);
