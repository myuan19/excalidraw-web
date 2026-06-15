/**
 * 兼容 upstream excalidraw 组件中的 legacy 相对路径 import（../../element/* 等）。
 * 实际实现来自 monorepo 内的 @excalidraw/* 包，避免改动大量 upstream 源码。
 */
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PKG = path.join(ROOT, "packages/excalidraw");

const elementModules = [
  "index",
  "bounds",
  "types",
  "typeChecks",
  "mutateElement",
  "textElement",
  "cropElement",
  "binding",
  "resizeElements",
  "newElement",
  "embeddable",
  "collision",
  "elementLink",
];

for (const name of elementModules) {
  const target = path.join(PKG, "element", `${name}.ts`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const subpath = name === "index" ? "" : `/${name}`;
  fs.writeFileSync(
    target,
    `export * from "@excalidraw/element${subpath}";\n`,
    "utf8",
  );
}

fs.writeFileSync(
  path.join(PKG, "keys.ts"),
  `export * from "@excalidraw/common/keys";\n`,
  "utf8",
);

fs.writeFileSync(
  path.join(PKG, "groups.ts"),
  `export {
  elementsAreInSameGroup,
  isInGroup,
  selectGroupsFromGivenElements,
} from "@excalidraw/element";\n`,
  "utf8",
);

fs.writeFileSync(
  path.join(PKG, "frame.ts"),
  `export { frameAndChildrenSelectedTogether } from "@excalidraw/element";\n`,
  "utf8",
);

fs.writeFileSync(
  path.join(PKG, "store.ts"),
  `export { CaptureUpdateAction } from "@excalidraw/element";\n`,
  "utf8",
);

console.log("Created excalidraw legacy import shims");
