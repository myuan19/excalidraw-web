function escapeForScript(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function buildDataUrl(fileId, token) {
  return `/embed/api/${encodeURIComponent(fileId)}/data?_t=${encodeURIComponent(
    token,
  )}`;
}

export function buildEmbedBootstrapScript({
  fileId,
  fileName,
  kind,
  token,
}) {
  const bootstrap = {
    fileId,
    fileName,
    kind,
    token,
    dataUrl: buildDataUrl(fileId, token),
  };
  return `<script>window.__EXCALIDRAW_EMBED_MODE__=true;window.__EXCALIDRAW_EMBED_BOOTSTRAP__=${escapeForScript(
    JSON.stringify(bootstrap),
  )};</script>`;
}

export function injectEmbedBootstrap(html, bootstrap) {
  const script = buildEmbedBootstrapScript(bootstrap);
  if (html.includes("</head>")) {
    return html.replace("</head>", `${script}\n</head>`);
  }
  return `${script}\n${html}`;
}
