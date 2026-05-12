import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const appPath = path.join(repoRoot, "excalidraw-app/App.tsx");
const shellPath = path.join(repoRoot, "excalidraw-app/MindMapEditorShell.tsx");
const nativeIndexPath = path.join(repoRoot, "public/mind-map/index.html");
const nativeAppJsPath = path.join(repoRoot, "public/mind-map/dist/js/app.js");
const toolbarPath = path.join(
  repoRoot,
  "mind-map/web/src/pages/Edit/components/Toolbar.vue",
);
const hostBridgePath = path.join(repoRoot, "mind-map/web/src/utils/hostBridge.js");
const typesPath = path.join(repoRoot, "excalidraw-app/simple-mind-map.d.ts");
const packagePath = path.join(repoRoot, "excalidraw-app/package.json");
const lockPath = path.join(repoRoot, "yarn.lock");

const appSource = readFileSync(appPath, "utf8");
const shellSource = readFileSync(shellPath, "utf8");
const nativeIndexSource = readFileSync(nativeIndexPath, "utf8");
const nativeAppJsSource = readFileSync(nativeAppJsPath, "utf8");
const toolbarSource = readFileSync(toolbarPath, "utf8");
const hostBridgeSource = readFileSync(hostBridgePath, "utf8");
const typesSource = readFileSync(typesPath, "utf8");
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
const lockSource = readFileSync(lockPath, "utf8");

const checks = [
  {
    name: "excalidraw-app depends on local simple-mind-map package",
    pass:
      packageJson.dependencies?.["simple-mind-map"] ===
      "file:../mind-map/simple-mind-map",
  },
  {
    name: "yarn.lock records local simple-mind-map package and native assets are built",
    pass:
      /simple-mind-map@file:(\.\.\/)?mind-map\/simple-mind-map/.test(
        lockSource,
      ) &&
      nativeAppJsSource.length > 1000,
  },
  {
    name: "App lazy-routes kind=mindmap to MindMapEditorShell",
    pass:
      /lazy\(\(\) => import\("\.\/MindMapEditorShell"\)\)/.test(appSource) &&
      /documentKind === "mindmap"/.test(appSource) &&
      /<LazyMindMapEditorShell \/>/.test(appSource),
  },
  {
    name: "MindMapEditorShell embeds the native MindMap web UI instead of rebuilding toolbar in React",
    pass:
      /<iframe/.test(shellSource) &&
      /NATIVE_MINDMAP_URL/.test(shellSource) &&
      /hostRequestSave/.test(shellSource) &&
      /hostOpenAISettings/.test(shellSource) &&
      !/mindmap-editor__overlay/.test(shellSource) &&
      !/new MindMap\(/.test(shellSource) &&
      !/INSERT_CHILD_NODE/.test(shellSource),
  },
  {
    name: "Native toolbar owns host action buttons through hostBridge",
    pass:
      /hostToolbarBlock/.test(toolbarSource) &&
      /hostBackToFiles/.test(hostBridgeSource) &&
      /hostRequestSave/.test(hostBridgeSource) &&
      /hostOpenAISettings/.test(hostBridgeSource) &&
      /hostOpenHistory/.test(hostBridgeSource) &&
      /hostSaveAndBack/.test(hostBridgeSource),
  },
  {
    name: "Native MindMap page runs in takeOverApp mode and exposes bridge methods",
    pass:
      /window\.takeOverApp = true/.test(nativeIndexSource) &&
      /takeOverAppMethods/.test(nativeIndexSource) &&
      /saveMindMapData/.test(nativeIndexSource) &&
      /postMessage/.test(nativeIndexSource),
  },
  {
    name: "MindMap iframe clipboard operations are proxied through host bridge",
    pass:
      /CLIPBOARD_READ/.test(shellSource) &&
      /CLIPBOARD_WRITE_TEXT/.test(shellSource) &&
      /CLIPBOARD_WRITE_IMAGE/.test(shellSource) &&
      /readClipboardItems/.test(nativeIndexSource) &&
      /writeClipboardText/.test(nativeIndexSource) &&
      /writeClipboardImage/.test(nativeIndexSource),
  },
  {
    name: "TypeScript has a minimal simple-mind-map declaration",
    pass: /declare module "simple-mind-map"/.test(typesSource),
  },
];

const result = {
  id: "P0-4",
  title: "MindMap 编辑器嵌入 React/Vite",
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
