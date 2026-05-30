import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const files = {
  architectureChecklist:
    "_docs/v0.1.0/新增功能/架构清晰化改造清单.md",
  mindMapUiChecklist:
    "_docs/v0.1.0/新增功能/MindMap原生UI适配功能修改清单.md",
  serverSync: "excalidraw-app/data/ServerSync.ts",
  fileList: "excalidraw-app/components/FileList.tsx",
  migrations: "excalidraw-app/data/documentMigrations.ts",
  textAdapter: "excalidraw-app/data/formats/TextAdapter.ts",
  registry: "excalidraw-app/data/formats/registry.ts",
  mindMapShell: "excalidraw-app/MindMapEditorShell.tsx",
  mindMapSaveHook: "excalidraw-app/hooks/useMindMapFileSave.ts",
  fileIdFromHash: "excalidraw-app/data/fileIdFromHash.ts",
  toolbar: "mind-map/web/src/pages/Edit/components/Toolbar.vue",
  hostBridge: "mind-map/web/src/utils/hostBridge.js",
  nativeIndex: "mind-map/web/public/index.html",
  simpleMindMapUtils: "mind-map/simple-mind-map/src/utils/index.js",
  webUtils: "mind-map/web/src/utils/index.js",
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, rel]) => [
    key,
    readFileSync(path.join(repoRoot, rel), "utf8"),
  ]),
);

const checks = [
  {
    name: "Import flow uses adapter registry for non-Excalidraw formats",
    pass:
      /getDocumentFormatAdapter\(detected\.kind\)/.test(source.fileList) &&
      /adapter\.parse\(file\)/.test(source.fileList) &&
      /adapter\.toDocument\(data\)/.test(source.fileList),
  },
  {
    name: "Download flow serializes by adapter and preserves extensions",
    pass:
      /getDocumentFormatAdapter\(kind\)/.test(source.serverSync) &&
      /adapter\.serialize/.test(source.serverSync) &&
      /kind === "mindmap" \? "smm"/.test(source.serverSync),
  },
  {
    name: "Container and format migration registry exists",
    pass:
      /CURRENT_CONTAINER_VERSION/.test(source.migrations) &&
      /formatMigrations/.test(source.migrations) &&
      /migrateManagedDocument/.test(source.migrations),
  },
  {
    name: "Third text format adapter is registered",
    pass:
      /TextAdapter/.test(source.textAdapter) &&
      /serialize\(data: TextDocumentData\): Promise<string>/.test(
        source.textAdapter,
      ) &&
      /\[TextAdapter\.kind,\s*TextAdapter\]/.test(source.registry),
  },
  {
    name: "MindMap enhancements are wired",
    pass:
      /useMindMapFileSave/.test(source.mindMapShell) &&
      /ArchivePanel/.test(source.mindMapShell) &&
      /buildMindMapThumbnailSvg/.test(source.mindMapSaveHook) &&
      /saveMindMapData/.test(source.mindMapShell) &&
      /hostSaveAndBack/.test(source.mindMapShell) &&
      /hostOpenHistory/.test(source.mindMapShell) &&
      /<iframe/.test(source.mindMapShell) &&
      /FileSyncState\.setLocalCache/.test(source.mindMapSaveHook) &&
      /mindMapGoHomeWithServerSave/.test(source.mindMapSaveHook) &&
      /hostToolbarBlock/.test(source.toolbar) &&
      /hostHistory/.test(source.toolbar) &&
      /hostRequestSave/.test(source.hostBridge),
  },
  {
    name: "MindMap clipboard bridge from Notion plugin is migrated",
    pass:
      /CLIPBOARD_READ/.test(source.mindMapShell) &&
      /CLIPBOARD_WRITE_TEXT/.test(source.mindMapShell) &&
      /CLIPBOARD_WRITE_IMAGE/.test(source.mindMapShell) &&
      /readClipboardItems/.test(source.nativeIndex) &&
      /writeClipboardText/.test(source.nativeIndex) &&
      /writeClipboardImage/.test(source.nativeIndex) &&
      /window\.takeOverAppMethods\?\.readClipboardItems/.test(
        source.simpleMindMapUtils,
      ) &&
      /window\.takeOverAppMethods\?\.writeClipboardText/.test(source.webUtils),
  },
  {
    name: "Hash parser supports query-style file hashes",
    pass:
      /new URLSearchParams/.test(source.fileIdFromHash) &&
      /params\.get\("file"\)/.test(source.fileIdFromHash),
  },
  {
    name: "architecture and MindMap UI implementation docs exist",
    pass:
      /架构清晰化应分阶段推进/.test(source.architectureChecklist) &&
      /原生工具栏增加宿主操作按钮/.test(source.mindMapUiChecklist),
  },
];

const result = {
  id: "P2-4",
  title: "todo-list 全部完成验证",
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
