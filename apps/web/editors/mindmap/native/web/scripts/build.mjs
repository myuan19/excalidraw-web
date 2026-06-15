import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import esbuild from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "dist");
const runtimeEntry = path.join(root, "src/runtime/editor.mjs");
const bridgeSource = path.join(root, "src/bridge/takeover-shell.js");
const smmCss = path.join(
  root,
  "node_modules/simple-mind-map/dist/simpleMindMap.esm.min.css",
);

function hash(content) {
  return createHash("sha256").update(content).digest("hex").slice(0, 8);
}

function write(file, content) {
  const target = path.join(outDir, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

fs.rmSync(outDir, { recursive: true, force: true });

const chunkId = "chunk-editor";

await esbuild.build({
  entryPoints: [runtimeEntry],
  outfile: path.join(outDir, "dist/js", `${chunkId}.tmp.js`),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2020"],
  minify: true,
  sourcemap: false,
  logLevel: "info",
});

const bundledChunk = fs.readFileSync(
  path.join(outDir, "dist/js", `${chunkId}.tmp.js`),
);
const chunkHash = hash(bundledChunk);
const chunkFile = `${chunkId}.${chunkHash}.js`;
fs.renameSync(
  path.join(outDir, "dist/js", `${chunkId}.tmp.js`),
  path.join(outDir, "dist/js", chunkFile),
);

const appSource = `const source = "simple-mind-map-native";
const lazyChunks = {"${chunkId}":"${chunkHash}"};
let runtimeReady = false;
let latestPayload = null;
let editorApi = null;

function postToHost(type, payload = {}) {
  window.parent?.postMessage({ source, type, ...payload }, "*");
}

function isRuntimeReady() {
  return runtimeReady;
}

async function ensureEditorApi() {
  if (editorApi) return editorApi;
  editorApi = await import("./${chunkFile}");
  return editorApi;
}

async function startTakeOverApp(payload = latestPayload) {
  latestPayload = payload;
  const root = document.getElementById("app");
  const mod = await ensureEditorApi();
  await mod.renderMindMap(root, payload);
  runtimeReady = true;
  postToHost("appInited");
}

window.startTakeOverApp = startTakeOverApp;
window.isRuntimeReady = isRuntimeReady;

window.addEventListener("message", (event) => {
  const msg = event.data || {};
  const type = msg.type;
  if (!type) return;

  if (type === "init" || type === "initMindMap" || type === "setMindMapData") {
    startTakeOverApp(msg).catch((error) =>
      postToHost("mindMapIframeError", {
        message: String(error?.message || error),
        ok: false,
      }),
    );
    return;
  }

  if (type === "restoreMindMapView" || type === "host_restore_preview_view") {
    ensureEditorApi()
      .then((mod) => mod.handleHostCommand(type, msg.payload || msg))
      .catch((error) =>
        postToHost("mindMapIframeError", {
          message: String(error?.message || error),
          ok: false,
        }),
      );
    return;
  }

  if (type === "requestMindMapSave" || type === "mindMapHostSaveStatus") {
    ensureEditorApi()
      .then((mod) => mod.handleHostCommand(type, msg.payload || msg))
      .catch((error) =>
        postToHost("mindMapIframeError", {
          message: String(error?.message || error),
          ok: false,
        }),
      );
  }
});

postToHost("ready", { chunks: lazyChunks });
if (!window.takeOverApp) {
  startTakeOverApp({
    data: {
      root: {
        data: { text: "<p>MindMap</p>", richText: true, expand: true },
        children: [],
      },
      theme: "default",
      layout: "logicalStructure",
    },
  });
}
`;

const appHash = hash(appSource);
const appFile = `app.${appHash}.js`;
write(`dist/js/${appFile}`, appSource);

const cssBase = fs.readFileSync(smmCss, "utf8");
const cssExtra = `
html, body, #app { height: 100%; margin: 0; overflow: hidden; }
#app { background: #f8fafc; }
.mindmap-native-root { width: 100%; height: 100%; }
`;
const cssFile = `app.${hash(cssBase + cssExtra)}.css`;
write(`dist/css/${cssFile}`, `${cssBase}\n${cssExtra}`);

copyFile(bridgeSource, path.join(outDir, "dist/bridge/takeover-shell.js"));

const indexHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,user-scalable=no,initial-scale=1,maximum-scale=1,minimum-scale=1">
  <link rel="icon" href="dist/logo.ico">
  <title>EditorHub MindMap</title>
  <script>
    window.externalPublicPath = './dist/';
    window.takeOverApp = (window.parent !== window);
  </script>
  <link href="dist/css/${cssFile}" rel="stylesheet">
</head>
<body>
  <noscript><strong>MindMap requires JavaScript.</strong></noscript>
  <div id="app"></div>
  <script src="dist/bridge/takeover-shell.js"></script>
  <script type="module" src="dist/js/${appFile}"></script>
</body>
</html>
`;
write("index.html", indexHtml);

const logo = path.join(
  root,
  "../../../../../../public/icons/mindmap.ico",
);
if (fs.existsSync(logo)) {
  copyFile(logo, path.join(outDir, "dist/logo.ico"));
}

console.log(`[mindmap-build] ok — app=${appFile}, chunk=${chunkFile}`);
