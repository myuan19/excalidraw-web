import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const fileListPath = join(repoRoot, "excalidraw-app/components/FileList.tsx");
const serverSyncPath = join(repoRoot, "excalidraw-app/data/ServerSync.ts");
const appPath = join(repoRoot, "excalidraw-app/App.tsx");
const serverDbPath = join(repoRoot, "server/db.js");
const serverRoutesPath = join(repoRoot, "server/routes/files.js");

const fileList = readFileSync(fileListPath, "utf8");
const serverSync = readFileSync(serverSyncPath, "utf8");
const app = readFileSync(appPath, "utf8");
const serverDb = readFileSync(serverDbPath, "utf8");
const serverRoutes = readFileSync(serverRoutesPath, "utf8");

const checks = {
  serverFileHasDataUnknown: serverSync.includes("data?: ForkSceneSnapshot | unknown"),
  serverFileHasKindField: serverSync.includes("kind?: string"),
  serverCreateFileAcceptsKind:
    serverSync.includes('kind = "excalidraw"') &&
    serverSync.includes("folder_id: folderId ?? null, kind"),
  dbHasKindColumn:
    serverDb.includes("kind       TEXT NOT NULL DEFAULT 'excalidraw'") &&
    serverDb.includes("ALTER TABLE files ADD COLUMN kind TEXT NOT NULL DEFAULT 'excalidraw'"),
  routesReturnKind:
    serverRoutes.includes("kind: r.kind || \"excalidraw\"") &&
    serverRoutes.includes("f.kind"),
  openCallbackReceivesFileObject: fileList.includes(
    "onOpenFile: (file: { id: string; kind?: string }) => void",
  ),
  cardOpenPassesKind:
    fileList.includes("onOpenFile({ id: f.id, kind: f.kind ?? \"excalidraw\" })") &&
    fileList.includes("kind: f.kind ?? \"excalidraw\""),
  createFileDefaultsExcalidraw:
    fileList.includes('ServerSync.createFile(') &&
    fileList.includes('"excalidraw"') &&
    fileList.includes('onOpenFile({ id, kind: "excalidraw" })'),
  appBuildsKindHash:
    app.includes("function buildFileHash") &&
    app.includes('params.set("kind", kind)'),
  appBranchesOnKind:
    app.includes("getDocumentKindFromHash") &&
    app.includes('documentKind !== "excalidraw"') &&
    app.includes("UnsupportedDocumentFallback"),
  importStillExcalidrawOnly:
    fileList.includes(".excalidraw,.json,.png,.svg") &&
    !fileList.includes(".smm"),
};

const result = {
  id: "P1-4",
  title: "文件列表多格式路由",
  conclusion:
    checks.serverFileHasKindField &&
    checks.serverCreateFileAcceptsKind &&
    checks.dbHasKindColumn &&
    checks.routesReturnKind &&
    checks.openCallbackReceivesFileObject &&
    checks.cardOpenPassesKind &&
    checks.createFileDefaultsExcalidraw &&
    checks.appBuildsKindHash &&
    checks.appBranchesOnKind
      ? "PASS_WITH_IMPORT_MVP_PENDING"
      : "FAIL",
  checks,
  recommendation:
    "Kind is now propagated through storage/list/open routing. Import remains Excalidraw-only until the unified import/export stage.",
};

writeFileSync(join(__dirname, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(`${result.id} ${result.conclusion}`);
