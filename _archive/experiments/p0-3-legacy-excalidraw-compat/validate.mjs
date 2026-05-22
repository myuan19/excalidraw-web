import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

const legacyScene = {
  type: "excalidraw",
  version: 2,
  source: "excalidraw-local",
  elements: [],
  appState: {},
  files: {},
};

const managedScene = {
  kind: "excalidraw",
  containerVersion: 1,
  formatVersion: 2,
  data: legacyScene,
};

function inferDocument(input) {
  if (
    input &&
    typeof input === "object" &&
    typeof input.kind === "string" &&
    "data" in input
  ) {
    return input;
  }
  if (
    input &&
    typeof input === "object" &&
    (input.type === "excalidraw" || "elements" in input || "appState" in input)
  ) {
    return {
      kind: "excalidraw",
      containerVersion: 1,
      formatVersion: typeof input.version === "number" ? input.version : 1,
      data: input,
      legacy: true,
    };
  }
  return null;
}

const serverPost = readFileSync(join(repoRoot, "server/routes/files.js"), "utf8");
const blobLoader = readFileSync(
  join(repoRoot, "packages/excalidraw/data/blob.ts"),
  "utf8",
);
const forkTypes = readFileSync(
  join(repoRoot, "app/data/forkFileTypes.ts"),
  "utf8",
);

const inferredLegacy = inferDocument(legacyScene);
const inferredManaged = inferDocument(managedScene);

const checks = {
  legacyInferredAsExcalidraw: inferredLegacy?.kind === "excalidraw",
  legacyVersionPreserved: inferredLegacy?.formatVersion === 2,
  managedDocumentPassesThrough: inferredManaged === managedScene,
  serverCreateStillWritesLegacyScene:
    serverPost.includes('type: "excalidraw"') &&
    serverPost.includes("elements: []") &&
    serverPost.includes("appState: {}") &&
    serverPost.includes("files: {}"),
  blobLoaderHasLegacyRepair:
    blobLoader.includes("EXPORT_DATA_TYPES.excalidraw") &&
    blobLoader.includes("elements"),
  localCacheCurrentlyRequiresElements: forkTypes.includes('if (!("elements" in body))'),
};

const result = {
  id: "P0-3",
  title: "旧 .excalidraw 文件兼容",
  conclusion:
    checks.legacyInferredAsExcalidraw &&
    checks.legacyVersionPreserved &&
    checks.managedDocumentPassesThrough &&
    checks.serverCreateStillWritesLegacyScene &&
    checks.blobLoaderHasLegacyRepair
      ? "PASS_WITH_LOCAL_CACHE_RISK"
      : "FAIL",
  checks,
  recommendation:
    "Introduce inferDocument/normalizeDocument at the file boundary and update local cache parsing before switching storage to ManagedDocument.",
};

writeFileSync(join(__dirname, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(`${result.id} ${result.conclusion}`);
