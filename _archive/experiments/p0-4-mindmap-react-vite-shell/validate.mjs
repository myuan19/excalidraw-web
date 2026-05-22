import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const mindMapRoot = "/root/projects/archive/mind-map";

const appPkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const mindPkg = JSON.parse(
  readFileSync(join(mindMapRoot, "simple-mind-map/package.json"), "utf8"),
);
const mindIndex = readFileSync(join(mindMapRoot, "simple-mind-map/index.js"), "utf8");

const requiredMindDeps = [
  "@svgdotjs/svg.js",
  "deepmerge",
  "eventemitter3",
  "quill",
];
const rootDeps = {
  ...(appPkg.dependencies ?? {}),
  ...(appPkg.devDependencies ?? {}),
};

const checks = {
  reactVitePresent:
    Boolean(rootDeps["@vitejs/plugin-react"]) && Boolean(rootDeps.vite),
  mindMapFrameworkAgnosticClaimed: readFileSync(
    join(mindMapRoot, "README.md"),
    "utf8",
  ).includes("不依赖任何框架"),
  mindMapConstructorAcceptsElement:
    mindIndex.includes("constructor(opt = {})") &&
    mindIndex.includes("this.el = this.opt.el") &&
    mindIndex.includes("if (!this.el) throw new Error"),
  mindMapHasDestroy:
    mindIndex.includes("destroy()") &&
    mindIndex.includes("this.event.unbind()") &&
    mindIndex.includes("this.el.innerHTML = ''"),
  missingDepsInExcalidrawWeb: requiredMindDeps.filter((dep) => !rootDeps[dep]),
};

const result = {
  id: "P0-4",
  title: "MindMap 编辑器嵌入 React/Vite",
  conclusion:
    checks.reactVitePresent &&
    checks.mindMapFrameworkAgnosticClaimed &&
    checks.mindMapConstructorAcceptsElement &&
    checks.mindMapHasDestroy &&
    checks.missingDepsInExcalidrawWeb.length === 0
      ? "PASS"
      : "PARTIAL_PASS_NEEDS_DEPENDENCY_INSTALL_AND_BROWSER_POC",
  checks,
  recommendation:
    "Use a React shell with a ref container, instantiate MindMap in useEffect, call mindMap.destroy() on cleanup. Before runtime PoC, add or alias missing simple-mind-map dependencies in excalidraw-web.",
};

writeFileSync(join(__dirname, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(`${result.id} ${result.conclusion}`);
