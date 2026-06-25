import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const linkPath = path.join(webRoot, "node_modules/simple-mind-map");
const targetPath = path.resolve(webRoot, "../simple-mind-map");

if (!fs.existsSync(targetPath)) {
  console.warn("[link-simple-mind-map] target missing:", targetPath);
  process.exit(0);
}

const indexPath = path.join(targetPath, "index.js");
const indexSource = fs.readFileSync(indexPath, "utf8");
if (!indexSource.includes("MindMap.usePlugin")) {
  console.error(
    "[link-simple-mind-map] simple-mind-map/index.js looks like a stub (missing usePlugin). Restore the full MindMap runtime.",
  );
  process.exit(1);
}

if (fs.existsSync(linkPath)) {
  const stat = fs.lstatSync(linkPath);
  if (stat.isSymbolicLink() || stat.isDirectory()) {
    process.exit(0);
  }
  fs.rmSync(linkPath, { recursive: true, force: true });
}

fs.symlinkSync(targetPath, linkPath, "junction");
console.log("[link-simple-mind-map] linked", linkPath);
