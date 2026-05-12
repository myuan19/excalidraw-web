import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const detectPath = path.join(
  repoRoot,
  "excalidraw-app/data/formats/detectFormat.ts",
);
const fileListPath = path.join(
  repoRoot,
  "excalidraw-app/components/FileList.tsx",
);
const todoPath = path.join(repoRoot, "docs/todo-list.md");

const detectSource = readFileSync(detectPath, "utf8");
const fileListSource = readFileSync(fileListPath, "utf8");
const todoSource = readFileSync(todoPath, "utf8");

const checks = [
  {
    name: "detectFormat module exists and exports file/data detection",
    pass:
      /export async function detectFormat\(file: File\)/.test(detectSource) &&
      /export function detectFormatFromData/.test(detectSource),
  },
  {
    name: "detectFormat recognizes managed/raw MindMap payloads",
    pass:
      /isManagedDocument\(data\)/.test(detectSource) &&
      /data\.kind === "mindmap"/.test(detectSource) &&
      /MindMapAdapter\.validate/.test(detectSource),
  },
  {
    name: "detectFormat preserves Excalidraw recognition",
    pass:
      /isLegacyExcalidrawScene\(data\)/.test(detectSource) &&
      /application\/vnd\.excalidraw\+json/.test(detectSource) &&
      /\.excalidraw/.test(detectSource),
  },
  {
    name: "detectFormat does not classify arbitrary JSON as MindMap",
    pass:
      /return \{ kind: "unknown", confidence: "low", parsed: data \}/.test(
        detectSource,
      ) &&
      !/name\.endsWith\("\.json"\)[\s\S]{0,120}kind: "mindmap"/.test(
        detectSource,
      ),
  },
  {
    name: "FileList import accepts .smm and MindMap MIME",
    pass:
      /IMPORTABLE_NAME = .*smm/.test(fileListSource) &&
      /application\/vnd\.simple-mind-map\+json/.test(fileListSource) &&
      /accept="[^"]*\.smm/.test(fileListSource),
  },
  {
    name: "FileList routes detected non-Excalidraw imports through adapter registry",
    pass:
      /const detected = await detectFormat\(file\)/.test(fileListSource) &&
      /getDocumentFormatAdapter\(detected\.kind\)/.test(fileListSource) &&
      /ServerSync\.createFile\([\s\S]*adapter\.kind[\s\S]*\)/.test(
        fileListSource,
      ) &&
      /adapter\.toDocument\(data\)/.test(fileListSource),
  },
  {
    name: "todo-list tracks remaining stage 7 tasks",
    pass:
      /引入统一 `detectFormat\(file\)`/.test(todoSource) &&
      /文件列表导入链路支持 `\.smm`/.test(todoSource),
  },
];

const result = {
  id: "P2-3",
  title: "detectFormat 与 MindMap 导入",
  status: checks.every((check) => check.pass) ? "PASS" : "FAIL",
  checks,
  scope:
    "This slice covers format detection and MindMap import. Full adapter-based export, migrations, and third-format validation remain pending.",
};

mkdirSync(__dirname, { recursive: true });
writeFileSync(
  path.join(__dirname, "result.json"),
  `${JSON.stringify(result, null, 2)}\n`,
);

if (result.status !== "PASS") {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(`${result.id} ${result.status}`);
