import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "packages/excalidraw/element");
const TAG = "v0.18.0";
const BASE = `https://raw.githubusercontent.com/excalidraw/excalidraw/${TAG}/packages/excalidraw`;

const treeResponse = await fetch(
  `https://api.github.com/repos/excalidraw/excalidraw/git/trees/${TAG}?recursive=1`,
);
const tree = await treeResponse.json();
const files = tree.tree
  .filter(
    (entry) =>
      entry.type === "blob" &&
      entry.path.startsWith("packages/excalidraw/element/"),
  )
  .map((entry) => entry.path.replace("packages/excalidraw/", ""));

fs.rmSync(TARGET, { recursive: true, force: true });

for (const relativePath of files) {
  const response = await fetch(`${BASE}/${relativePath}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${relativePath}: ${response.status}`);
  }
  const targetPath = path.join(ROOT, "packages/excalidraw", relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, await response.text(), "utf8");
  console.log(`restored ${relativePath}`);
}

console.log(`Done. restored ${files.length} files under packages/excalidraw/element/`);
