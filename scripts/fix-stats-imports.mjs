import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const statsDir = path.join(ROOT, "packages/excalidraw/components/Stats");

const replacements = [
  ['from "../../element/types"', 'from "@excalidraw/element/types"'],
  ['from "../../element/typeChecks"', 'from "@excalidraw/element"'],
  ['from "../../element/mutateElement"', 'from "@excalidraw/element"'],
  ['from "../../element/textElement"', 'from "@excalidraw/element"'],
  ['from "../../element/cropElement"', 'from "@excalidraw/element"'],
  ['from "../../element/resizeElements"', 'from "@excalidraw/element"'],
  ['from "../../element/newElement"', 'from "@excalidraw/element"'],
  ['from "../../element/binding"', 'from "@excalidraw/element"'],
  ['from "../../element/bounds"', 'from "@excalidraw/element"'],
  ['from "../../element"', 'from "@excalidraw/element"'],
  ['from "../../groups"', 'from "@excalidraw/element"'],
  ['from "../../frame"', 'from "@excalidraw/element"'],
];

for (const fileName of fs.readdirSync(statsDir)) {
  if (!fileName.endsWith(".ts") && !fileName.endsWith(".tsx")) {
    continue;
  }
  const filePath = path.join(statsDir, fileName);
  let source = fs.readFileSync(filePath, "utf8");
  const before = source;
  for (const [from, to] of replacements) {
    source = source.split(from).join(to);
  }
  if (source !== before) {
    fs.writeFileSync(filePath, source, "utf8");
    console.log(`updated ${fileName}`);
  }
}
