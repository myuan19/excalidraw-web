import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TAG = "v0.18.0";
const BASE = `https://raw.githubusercontent.com/excalidraw/excalidraw/${TAG}/packages/excalidraw`;

async function fetchFile(relativePath) {
  const candidates = [relativePath];
  if (!path.extname(relativePath)) {
    candidates.push(`${relativePath}.tsx`, `${relativePath}.ts`);
  }

  for (const candidate of candidates) {
    const normalized = candidate.replace(/\\/g, "/");
    try {
      const response = await fetch(`${BASE}/${normalized}`);
      if (!response.ok) {
        continue;
      }
      const target = path.join(ROOT, "packages/excalidraw", normalized);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, await response.text(), "utf8");
      console.log(`fetched ${normalized}`);
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

function resolveMissingImport(missing, fromFile) {
  const packageRelative = fromFile.split("packages/excalidraw/")[1]?.replace(/\\/g, "/");
  if (!packageRelative) {
    return null;
  }
  const fromDir = path.posix.dirname(packageRelative);
  if (missing.startsWith(".")) {
    return path.posix.normalize(`${fromDir}/${missing}`);
  }
  return missing;
}

function runBuild() {
  return spawnSync("corepack yarn build:app", {
    cwd: path.join(ROOT, "apps/web"),
    encoding: "utf8",
    shell: true,
  });
}

for (let attempt = 0; attempt < 40; attempt += 1) {
  const result = runBuild();
  if (result.status === 0) {
    console.log("BUILD OK");
    process.exit(0);
  }

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const match = output.match(
    /Could not resolve "([^"]+)" from "([^"]*packages[\\/]+excalidraw[\\/][^"]+)"/,
  );
  if (!match) {
    console.error(output.slice(-5000));
    process.exit(1);
  }

  const [, missing, fromFile] = match;
  const relativePath = resolveMissingImport(missing, fromFile);
  if (!relativePath) {
    console.error(`Unable to resolve import ${missing} from ${fromFile}`);
    process.exit(1);
  }

  let ok = false;
  for (let retry = 0; retry < 3; retry += 1) {
    ok = await fetchFile(relativePath);
    if (ok) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  if (!ok) {
    console.error(`Failed to fetch ${relativePath}`);
    process.exit(1);
  }
}

console.error("Exceeded fetch attempts");
process.exit(1);
