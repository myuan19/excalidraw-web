import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const adapterPath = path.join(
  repoRoot,
  "excalidraw-app/data/formats/MindMapAdapter.ts",
);
const registryPath = path.join(
  repoRoot,
  "excalidraw-app/data/formats/registry.ts",
);
const shellPath = path.join(repoRoot, "excalidraw-app/MindMapEditorShell.tsx");
const saveHookPath = path.join(
  repoRoot,
  "excalidraw-app/hooks/useMindMapFileSave.ts",
);
const nativeIndexPath = path.join(repoRoot, "public/mind-map/index.html");
const toolbarPath = path.join(
  repoRoot,
  "mind-map/web/src/pages/Edit/components/Toolbar.vue",
);
const hostBridgePath = path.join(repoRoot, "mind-map/web/src/utils/hostBridge.js");
const appPath = path.join(repoRoot, "excalidraw-app/App.tsx");
const fileListPath = path.join(
  repoRoot,
  "excalidraw-app/components/FileList.tsx",
);

const adapterSource = readFileSync(adapterPath, "utf8");
const registrySource = readFileSync(registryPath, "utf8");
const shellSource = readFileSync(shellPath, "utf8");
const saveHookSource = readFileSync(saveHookPath, "utf8");
const nativeIndexSource = readFileSync(nativeIndexPath, "utf8");
const toolbarSource = readFileSync(toolbarPath, "utf8");
const hostBridgeSource = readFileSync(hostBridgePath, "utf8");
const appSource = readFileSync(appPath, "utf8");
const fileListSource = readFileSync(fileListPath, "utf8");

const checks = [
  {
    name: "MindMapAdapter implements DocumentFormatAdapter and managed document wrapper",
    pass:
      /DocumentFormatAdapter<MindMapDocumentData>/.test(adapterSource) &&
      /kind:\s*"mindmap"/.test(adapterSource) &&
      /toDocument\(data: MindMapDocumentData\)/.test(adapterSource) &&
      /sourceVersion:\s*SIMPLE_MIND_MAP_VERSION/.test(adapterSource),
  },
  {
    name: "MindMapAdapter is registered in format registry",
    pass:
      /import \{ MindMapAdapter \}/.test(registrySource) &&
      /\[MindMapAdapter\.kind,\s*MindMapAdapter\]/.test(registrySource),
  },
  {
    name: "App routes kind=mindmap to the formal editor shell",
    pass:
      /import\("\.\/MindMapEditorShell"\)/.test(appSource) &&
      /documentKind === "mindmap"/.test(appSource) &&
      /<LazyMindMapEditorShell \/>/.test(appSource),
  },
  {
    name: "FileList can create kind=mindmap files with initial managed document",
    pass:
      /NewDocumentKind = "excalidraw" \| "mindmap"/.test(fileListSource) &&
      /ServerSync\.createFile\([\s\S]*"mindmap"[\s\S]*\)/.test(fileListSource) &&
      /MindMapAdapter\.toDocument\(MindMapAdapter\.createEmpty\(\)\)/.test(
        fileListSource,
      ),
  },
  {
    name: "MindMapEditorShell hosts native UI, saves bridged data, and tracks dirty hash",
    pass:
      /ServerSync\.getFile\(fileId\)/.test(shellSource) &&
      /<iframe/.test(shellSource) &&
      /saveMindMapData/.test(shellSource) &&
      /hostSaveAndBack/.test(shellSource) &&
      /hostOpenHistory/.test(shellSource) &&
      /useMindMapFileSave/.test(shellSource) &&
      /ServerSync\.saveFileImmediate\([\s\S]*fileId,[\s\S]*document,[\s\S]*getFileName\(\)/.test(
        saveHookSource,
      ) &&
      /hashDocumentSnapshot\(document\)/.test(saveHookSource) &&
      /FileSyncState\.setDraftHash/.test(saveHookSource),
  },
  {
    name: "Native MindMap web UI remains the feature surface",
    pass:
      /window\.takeOverApp = true/.test(nativeIndexSource) &&
      /window\.initApp\(\)/.test(nativeIndexSource) &&
      /takeOverAppMethods/.test(nativeIndexSource) &&
      /hostToolbarBlock/.test(toolbarSource) &&
      /postHostCommand/.test(hostBridgeSource),
  },
];

const result = {
  id: "P2-2",
  title: "MindMapAdapter MVP",
  status: checks.every((check) => check.pass) ? "PASS" : "FAIL",
  checks,
  scope:
    "MVP covers create, open, bridged native UI save, dirty hash and server persistence. Import detection, thumbnails, autosave and external attachments are handled in later validations.",
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
