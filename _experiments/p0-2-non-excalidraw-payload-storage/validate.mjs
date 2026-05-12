import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, ".tmp-data");
const fileId = randomUUID();
const fileDir = join(dataDir, "files", fileId);
const currentPath = join(fileDir, "current.excalidraw");

if (existsSync(dataDir)) {
  rmSync(dataDir, { recursive: true, force: true });
}
mkdirSync(fileDir, { recursive: true });

function hashJson(data) {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

function saveLikeServer(id, data, name = "MindMap PoC") {
  const now = new Date().toISOString();
  const sha = hashJson(data);
  writeFileSync(currentPath, JSON.stringify(data), "utf8");
  const archiveId = randomUUID();
  const archiveRel = `files/${id}/archives/${archiveId}.excalidraw`;
  const archiveAbs = join(dataDir, archiveRel);
  mkdirSync(dirname(archiveAbs), { recursive: true });
  writeFileSync(archiveAbs, JSON.stringify(data), "utf8");
  return {
    fileRow: { id, name, created_at: now, updated_at: now, content_sha256: sha },
    archiveRow: { id: archiveId, file_id: id, label: "", created_at: now, path: archiveRel, content_sha256: sha },
    sha,
    archiveId,
    archiveRel,
    archiveAbs,
  };
}

const payload = {
  kind: "mindmap",
  containerVersion: 1,
  formatVersion: 1,
  sourceVersion: "simple-mind-map@0.14.0-fix.2",
  data: {
    layout: "mindMap",
    root: {
      data: { uid: "root", text: "Root" },
      children: [{ data: { uid: "child", text: "Child" }, children: [] }],
    },
    theme: { template: "default", config: {} },
    view: { scale: 1, x: 0, y: 0 },
  },
};

const saved = saveLikeServer(fileId, payload);
const loaded = JSON.parse(readFileSync(currentPath, "utf8"));
const archiveLoaded = JSON.parse(readFileSync(saved.archiveAbs, "utf8"));

const checks = {
  currentFileExists: existsSync(currentPath),
  roundtripEqual: JSON.stringify(loaded) === JSON.stringify(payload),
  archiveRoundtripEqual: JSON.stringify(archiveLoaded) === JSON.stringify(payload),
  contentShaMatches: saved.fileRow.content_sha256 === saved.sha,
  archiveCreated: existsSync(saved.archiveAbs),
  hasNoSceneFields:
    !("elements" in loaded) && !("appState" in loaded) && !("files" in loaded),
  serverRouteObservation:
    "server/routes/files.js PUT path writes JSON.stringify(req.body.data) and hashes arbitrary JSON; route logging assumes scene summary but does not reject non-scene payloads.",
};

const result = {
  id: "P0-2",
  title: "当前文件系统保存非 Excalidraw payload",
  conclusion:
    checks.currentFileExists &&
    checks.roundtripEqual &&
    checks.archiveRoundtripEqual &&
    checks.contentShaMatches &&
    checks.archiveCreated &&
    checks.hasNoSceneFields
      ? "PASS"
      : "FAIL",
  checks,
  tempDataDirCleaned: true,
};

rmSync(dataDir, { recursive: true, force: true });
writeFileSync(join(__dirname, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(`${result.id} ${result.conclusion}`);
