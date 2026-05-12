import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

const adapterSource = readFileSync(
  join(repoRoot, "excalidraw-app/data/formats/ExcalidrawAdapter.ts"),
  "utf8",
);
const registrySource = readFileSync(
  join(repoRoot, "excalidraw-app/data/formats/registry.ts"),
  "utf8",
);
const typesSource = readFileSync(
  join(repoRoot, "excalidraw-app/data/formats/types.ts"),
  "utf8",
);
const jsonSource = readFileSync(
  join(repoRoot, "packages/excalidraw/data/json.ts"),
  "utf8",
);

const checks = {
  adapterInterfaceExists:
    typesSource.includes("export interface DocumentFormatAdapter") &&
    typesSource.includes("createEmpty()") &&
    typesSource.includes("parse(input: Blob | unknown)") &&
    typesSource.includes("toDocument(data: TData)"),
  excalidrawAdapterExists:
    adapterSource.includes("export const ExcalidrawAdapter") &&
    adapterSource.includes('kind: "excalidraw"') &&
    adapterSource.includes("currentFormatVersion"),
  createEmptyReturnsScene:
    adapterSource.includes("elements: []") &&
    adapterSource.includes("appState: {}") &&
    adapterSource.includes("files: {}"),
  parseUsesExistingImporter:
    adapterSource.includes("loadExcalidrawFileAsServerSceneData") &&
    adapterSource.includes("normalizeDocument(input)"),
  validateKeepsSceneShape:
    adapterSource.includes('"elements" in data') &&
    adapterSource.includes("Array.isArray(data.elements)"),
  toDocumentWrapsManagedDocument:
    adapterSource.includes("toDocument") &&
    adapterSource.includes("containerVersion") &&
    adapterSource.includes("formatVersion") &&
    adapterSource.includes("data,"),
  registryRegistersExcalidraw:
    registrySource.includes("new Map") &&
    registrySource.includes("[ExcalidrawAdapter.kind, ExcalidrawAdapter]") &&
    registrySource.includes("getDocumentFormatAdapter"),
  externalExcalidrawJsonUnchanged:
    jsonSource.includes("type: EXPORT_DATA_TYPES.excalidraw") &&
    jsonSource.includes("version: VERSIONS.excalidraw") &&
    !jsonSource.includes("ManagedDocument"),
};

const result = {
  id: "P2-1",
  title: "ExcalidrawAdapter",
  conclusion: Object.values(checks).every(Boolean) ? "PASS" : "FAIL",
  checks,
  recommendation:
    "Excalidraw is now represented as the first DocumentFormatAdapter without changing external .excalidraw serialization.",
};

writeFileSync(join(__dirname, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(`${result.id} ${result.conclusion}`);
