import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const files = {
  aiSettings: "excalidraw-app/components/AISettings.tsx",
  aiConfig: "excalidraw-app/data/aiConfig.ts",
  fileList: "excalidraw-app/components/FileList.tsx",
  mindMapShell: "excalidraw-app/MindMapEditorShell.tsx",
  excalidrawShell: "excalidraw-app/EditorShell.tsx",
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, rel]) => [
    key,
    readFileSync(path.join(repoRoot, rel), "utf8"),
  ]),
);

const checks = [
  {
    name: "AISettings copy states the config is shared by Home, Excalidraw and MindMap",
    pass:
      /首页、Excalidraw 和 MindMap 共用/.test(source.aiSettings) &&
      /saveAIConfigToServer/.test(source.aiSettings),
  },
  {
    name: "AI config is centralized in aiConfig and persisted via server API",
    pass:
      /\/api\/ai-settings/.test(source.aiConfig) &&
      /subscribeAIConfig/.test(source.aiConfig) &&
      /isAIConfigured/.test(source.aiConfig),
  },
  {
    name: "Home FileList uses the shared AISettings dialog",
    pass:
      /<AISettings open=\{showAISettings\}/.test(source.fileList) &&
      /ensureAIConfigLoaded/.test(source.fileList) &&
      /subscribeAIConfig/.test(source.fileList),
  },
  {
    name: "MindMapEditorShell uses the same AISettings dialog and aiConfig subscription",
    pass:
      /<AISettings[\s\S]*open=\{showAISettings\}/.test(source.mindMapShell) &&
      /ensureAIConfigLoaded/.test(source.mindMapShell) &&
      /subscribeAIConfig/.test(source.mindMapShell) &&
      /hostOpenAISettings/.test(source.mindMapShell),
  },
  {
    name: "Excalidraw AI features still use the shared aiConfig module",
    pass:
      /AIComponents/.test(source.excalidrawShell) &&
      /ensureAIConfigLoaded/.test(
        readFileSync(
          path.join(repoRoot, "excalidraw-app/components/AI.tsx"),
          "utf8",
        ),
      ),
  },
];

const result = {
  id: "P2-5",
  title: "共享 AI 配置入口",
  status: checks.every((check) => check.pass) ? "PASS" : "FAIL",
  checks,
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
