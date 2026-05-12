import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

const documentTypesSource = readFileSync(
  join(repoRoot, "excalidraw-app/data/documentTypes.ts"),
  "utf8",
);
const forkTypesSource = readFileSync(
  join(repoRoot, "excalidraw-app/data/forkFileTypes.ts"),
  "utf8",
);
const serverRoutesSource = readFileSync(
  join(repoRoot, "server/routes/files.js"),
  "utf8",
);
const blobLoaderSource = readFileSync(
  join(repoRoot, "packages/excalidraw/data/blob.ts"),
  "utf8",
);

const checks = {
  managedDocumentTypeExists:
    documentTypesSource.includes("export interface ManagedDocument") &&
    documentTypesSource.includes("containerVersion") &&
    documentTypesSource.includes("formatVersion"),
  normalizeDocumentExists:
    documentTypesSource.includes("export function normalizeDocument") &&
    documentTypesSource.includes("isManagedDocument(raw)") &&
    documentTypesSource.includes("isLegacyExcalidrawScene(raw)"),
  legacySceneWrapsAsExcalidraw:
    documentTypesSource.includes('kind: "excalidraw"') &&
    documentTypesSource.includes("data: raw"),
  localCacheUsesNormalizeDocument:
    forkTypesSource.includes("normalizeDocument") &&
    forkTypesSource.includes("document.kind !== \"excalidraw\"") &&
    forkTypesSource.includes("document: document as ManagedDocument<ForkSceneSnapshot>"),
  localCacheNoLongerRejectsMissingTopLevelElements:
    !forkTypesSource.includes('if (!("elements" in body))'),
  serverCreateStillWritesLegacyScene:
    serverRoutesSource.includes('type: "excalidraw"') &&
    serverRoutesSource.includes("elements: []") &&
    serverRoutesSource.includes("appState: {}") &&
    serverRoutesSource.includes("files: {}"),
  blobLoaderHasLegacyRepair:
    blobLoaderSource.includes("EXPORT_DATA_TYPES.excalidraw") &&
    blobLoaderSource.includes("elements"),
};

const result = {
  id: "P0-3",
  title: "旧 .excalidraw 文件兼容",
  conclusion: Object.values(checks).every(Boolean) ? "PASS" : "FAIL",
  checks,
  recommendation:
    "ManagedDocument normalization is available and local cache no longer requires top-level elements. Continue to keep external .excalidraw export format unchanged until adapter stage.",
};

writeFileSync(join(__dirname, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(`${result.id} ${result.conclusion}`);
