import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const nativeRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(nativeRoot, "../../../../..");
const webDist = path.join(nativeRoot, "web/dist");
const nativeDist = path.join(nativeRoot, "dist");
const publicMindMap = path.join(repoRoot, "public/mind-map");

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(src, dst);
    } else {
      fs.copyFileSync(src, dst);
    }
  }
}

if (!fs.existsSync(path.join(webDist, "index.html"))) {
  throw new Error(`MindMap web build not found: ${webDist}`);
}

for (const target of [nativeDist, publicMindMap]) {
  fs.rmSync(target, { recursive: true, force: true });
  copyDir(webDist, target);
}

fs.copyFileSync(path.join(webDist, "index.html"), path.join(nativeRoot, "index.html"));
console.log(`[mindmap-copy] synced ${path.relative(repoRoot, publicMindMap)}`);
