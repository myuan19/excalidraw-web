import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const sceneHashSource = readFileSync(
  join(repoRoot, "app/data/sceneHash.ts"),
  "utf8",
);
const serverSyncSource = readFileSync(
  join(repoRoot, "app/data/ServerSync.ts"),
  "utf8",
);

function stableNormalize(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stableNormalize(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const normalized = {};
  for (const [key, entryValue] of Object.entries(value)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))) {
    normalized[key] = stableNormalize(entryValue);
  }
  return normalized;
}

function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h, 33) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

function currentHashSceneSnapshot(data) {
  if (!data || typeof data !== "object") {
    return "0";
  }
  const appState =
    data.appState && typeof data.appState === "object" && "name" in data.appState
      ? Object.fromEntries(
          Object.entries(data.appState).filter(([key]) => key !== "name"),
        )
      : data.appState;
  try {
    const payload = {
      elements: data.elements,
      appState,
      files: data.files ?? {},
    };
    return hashString(JSON.stringify(stableNormalize(payload)));
  } catch {
    return hashString(JSON.stringify(data));
  }
}

function proposedDocumentHash(data) {
  return hashString(JSON.stringify(stableNormalize(data)));
}

const mindmapA = {
  kind: "mindmap",
  containerVersion: 1,
  formatVersion: 1,
  data: {
    root: { data: { text: "A" }, children: [] },
  },
};
const mindmapB = {
  kind: "mindmap",
  containerVersion: 1,
  formatVersion: 1,
  data: {
    root: { data: { text: "B" }, children: [] },
  },
};
const excalidrawA = {
  type: "excalidraw",
  version: 2,
  elements: [{ id: "a", type: "rectangle" }],
  appState: { name: "One" },
  files: {},
};
const excalidrawRenamed = {
  ...excalidrawA,
  appState: { name: "Two" },
};

const checks = {
  currentHashIgnoresMindmapData:
    currentHashSceneSnapshot(mindmapA) === currentHashSceneSnapshot(mindmapB),
  proposedHashDetectsMindmapData:
    proposedDocumentHash(mindmapA) !== proposedDocumentHash(mindmapB),
  currentHashIgnoresExcalidrawName:
    currentHashSceneSnapshot(excalidrawA) ===
    currentHashSceneSnapshot(excalidrawRenamed),
  serverSyncDispatchUsesSceneHash: serverSyncSource.includes("hashSceneSnapshot(data)"),
  sceneHashOnlyUsesSceneFields:
    sceneHashSource.includes("elements: o.elements") &&
    sceneHashSource.includes("appState") &&
    sceneHashSource.includes("files: o.files"),
};

const result = {
  id: "P0-5",
  title: "多格式 hash 与 dirty 判断",
  conclusion:
    checks.currentHashIgnoresMindmapData && checks.proposedHashDetectsMindmapData
      ? "FAIL_CURRENT_NEEDS_DOCUMENT_HASH"
      : "PASS",
  checks,
  hashes: {
    currentMindmapA: currentHashSceneSnapshot(mindmapA),
    currentMindmapB: currentHashSceneSnapshot(mindmapB),
    proposedMindmapA: proposedDocumentHash(mindmapA),
    proposedMindmapB: proposedDocumentHash(mindmapB),
  },
  recommendation:
    "Replace hashSceneSnapshot at multi-format boundaries with a document-level stable hash that includes kind/containerVersion/formatVersion/data. Preserve Excalidraw appState.name stripping inside ExcalidrawAdapter if needed.",
};

writeFileSync(join(__dirname, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(`${result.id} ${result.conclusion}`);
