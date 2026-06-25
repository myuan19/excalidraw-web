import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";

import { protocol, net } from "electron";

import { writeDesktopLog } from "./desktopLogger.mjs";

export const EDITORHUB_SCHEME = "editorhub";
export const EDITORHUB_APP_HOST = "app";
export const EDITORHUB_APP_INDEX_URL = `${EDITORHUB_SCHEME}://${EDITORHUB_APP_HOST}/index.html`;

const MIME_BY_EXT = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

export function registerEditorHubPrivileges() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: EDITORHUB_SCHEME,
      privileges: {
        bypassCSP: true,
        corsEnabled: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        standard: true,
      },
    },
  ]);
}

export function safeStaticPath(root, requestPath) {
  let decoded = "";
  try {
    decoded = decodeURIComponent(String(requestPath ?? "").split("?")[0] || "/");
  } catch {
    return null;
  }
  const normalized = decoded.startsWith("/") ? decoded : `/${decoded}`;
  const resolved = path.resolve(root, `.${normalized}`);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    return null;
  }
  return resolved;
}

function resolveMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

function resolveStaticFile(buildRoot, pathname) {
  const candidates = [];
  if (pathname === "/" || pathname === "") {
    candidates.push(path.join(buildRoot, "index.html"));
  } else {
    candidates.push(safeStaticPath(buildRoot, pathname));
  }
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    try {
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // ignore stat errors
    }
  }
  return null;
}

function pickPrecompressedPath(filePath, request) {
  const accept = String(request.headers.get("accept-encoding") ?? "");
  if (!/\bgzip\b/i.test(accept)) {
    return { filePath, contentEncoding: null };
  }
  const gzipPath = `${filePath}.gz`;
  if (!existsSync(gzipPath)) {
    return { filePath, contentEncoding: null };
  }
  return { filePath: gzipPath, contentEncoding: "gzip" };
}

async function serveStaticFile(buildRoot, request) {
  const url = new URL(request.url);
  const filePath = resolveStaticFile(buildRoot, url.pathname);
  if (!filePath) {
    return new Response("Not Found", { status: 404 });
  }
  const picked = pickPrecompressedPath(filePath, request);
  const headers = {
    "Content-Type": resolveMimeType(filePath),
    "Cache-Control": "no-cache",
  };
  if (picked.contentEncoding) {
    headers["Content-Encoding"] = picked.contentEncoding;
  }
  const stream = createReadStream(picked.filePath);
  return new Response(stream, { status: 200, headers });
}

async function proxyApiRequest(request, getLoopbackPort) {
  const port = await getLoopbackPort();
  const url = new URL(request.url);
  const target = `http://127.0.0.1:${port}${url.pathname}${url.search}`;
  return net.fetch(target, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });
}

/**
 * @param {{
 *   buildRoot: string;
 *   getLoopbackPort: () => Promise<number>;
 * }} options
 */
export async function registerEditorHubProtocol(options) {
  const buildRoot = path.resolve(options.buildRoot);
  const getLoopbackPort = options.getLoopbackPort;

  if (!existsSync(path.join(buildRoot, "index.html"))) {
    throw new Error(`EditorHub build root missing index.html: ${buildRoot}`);
  }

  protocol.handle(EDITORHUB_SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== EDITORHUB_APP_HOST) {
      return new Response("Forbidden", { status: 403 });
    }

    if (url.pathname.startsWith("/api/")) {
      return proxyApiRequest(request, getLoopbackPort);
    }

    return serveStaticFile(buildRoot, request);
  });

  writeDesktopLog("protocol", "editorhub-registered", {
    buildRoot,
    indexUrl: EDITORHUB_APP_INDEX_URL,
  });
}
