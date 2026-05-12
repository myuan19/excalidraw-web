import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const fileListPath = join(repoRoot, "excalidraw-app/components/FileList.tsx");
const serverSyncPath = join(repoRoot, "excalidraw-app/data/ServerSync.ts");

const fileList = readFileSync(fileListPath, "utf8");
const serverSync = readFileSync(serverSyncPath, "utf8");

const checks = {
  serverFileHasDataUnknown: serverSync.includes("data?: ForkSceneSnapshot | unknown"),
  serverFileHasNoKindField: !serverSync.includes("kind?:"),
  openCallbackOnlyReceivesId: fileList.includes("onOpenFile: (id: string) => void"),
  cardOpenDoesNotBranchOnKind:
    fileList.includes("onOpenFile(f.id)") && !fileList.includes("f.kind"),
  createFileOnlyExcalidrawDefault:
    fileList.includes("openNewFileDialog") &&
    fileList.includes("createFileOnServer(name)") &&
    !fileList.includes("kind"),
  importAcceptOnlyExcalidrawAndImages:
    fileList.includes(".excalidraw,.json,.png,.svg") &&
    !fileList.includes(".smm"),
};

const result = {
  id: "P1-4",
  title: "文件列表多格式路由",
  conclusion: "FAIL_CURRENT_NEEDS_KIND_ROUTING",
  checks,
  recommendation:
    "Add kind to ServerFile, propagate it through list/tree responses, update onOpenFile to receive or resolve kind, and branch editor routing before MindMap MVP.",
};

writeFileSync(join(__dirname, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(`${result.id} ${result.conclusion}`);
