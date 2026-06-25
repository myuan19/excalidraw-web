/* eslint-disable import/order -- load env/logging side effects before route modules */
import "./loadEnv.mjs";
import "./initLogging.mjs";

import { existsSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

import express from "express";
import cors from "cors";

import { createLogger } from "./lib/logger.js";
import { clientRequestContext } from "./lib/clientRequestContext.js";
import { isDebugLogAllowed, isHttpTraceEnabled, truncStr } from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HASHED_STATIC_ASSET_RE =
  /(?:^|\/)[^/]+\.[a-f0-9]{8,}\.(?:css|gif|ico|jpe?g|js|json|mjs|png|svg|webp|woff2?)$/i;

function isImmutableSpaAssetPath(urlPath) {
  if (!urlPath || typeof urlPath !== "string") {
    return false;
  }
  if (urlPath.includes("/mind-map/dist/bridge/")) {
    return false;
  }
  return HASHED_STATIC_ASSET_RE.test(urlPath);
}

function setSpaStaticCacheHeaders(res, filePath) {
  const normalized = filePath.split(path.sep).join("/");
  if (normalized.endsWith("/index.html") || normalized.endsWith(".html")) {
    res.setHeader("Cache-Control", "no-cache, must-revalidate");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return;
  }
  if (normalized.endsWith("/build-meta.json")) {
    res.setHeader("Cache-Control", "no-cache, must-revalidate");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return;
  }
  if (isImmutableSpaAssetPath(normalized)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    res.setHeader("Cache-Control", "no-cache, must-revalidate");
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function safeStaticPath(root, reqPath) {
  let decoded = "";
  try {
    decoded = decodeURIComponent(reqPath.split("?")[0] || "/");
  } catch {
    return null;
  }
  const resolved = path.resolve(root, `.${decoded}`);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    return null;
  }
  return resolved;
}

function servePrecompressedStatic(root) {
  return (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return next();
    }
    if (!/\bgzip\b/i.test(String(req.headers["accept-encoding"] || ""))) {
      return next();
    }
    const filePath = safeStaticPath(root, req.path);
    if (!filePath) {
      return next();
    }
    const gzipPath = `${filePath}.gz`;
    try {
      if (
        !existsSync(filePath) ||
        !existsSync(gzipPath) ||
        statSync(filePath).isDirectory()
      ) {
        return next();
      }
    } catch {
      return next();
    }
    setSpaStaticCacheHeaders(res, filePath);
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Vary", "Accept-Encoding");
    res.type(filePath);
    return res.sendFile(gzipPath);
  };
}

function resolveSpaRoot(rawValue) {
  const raw = (rawValue || "").trim();
  if (!raw) {
    return null;
  }
  if (raw === "1" || raw === "true") {
    return path.join(__dirname, "../apps/web/build");
  }
  return path.isAbsolute(raw) ? raw : path.join(__dirname, raw);
}

async function loadDefaultRouters() {
  const [
    { default: filesRouter },
    { default: libraryRouter },
    { default: aiSettingsRouter },
    { default: aiPromptPresetsRouter },
    { default: aiProxyRouter },
    { default: mindMapAiRouter },
    { default: ttdChatsRouter },
    { default: logsRouter },
    { tokenRouter: embedTokenRouter, pageRouter: embedPageRouter },
  ] = await Promise.all([
    import("./routes/files.js"),
    import("./routes/library.js"),
    import("./routes/ai-settings.js"),
    import("./routes/ai-prompt-presets.js"),
    import("./routes/ai-proxy.js"),
    import("./routes/mindmap-ai.js"),
    import("./routes/ttd-chats.js"),
    import("./routes/logs.js"),
    import("./routes/embed.js"),
  ]);

  return {
    filesRouter,
    libraryRouter,
    aiSettingsRouter,
    aiPromptPresetsRouter,
    aiProxyRouter,
    mindMapAiRouter,
    ttdChatsRouter,
    logsRouter,
    embedTokenRouter,
    embedPageRouter,
  };
}

function createUnavailableRouter(name) {
  const router = express.Router();
  router.use((_req, res) => {
    res.status(501).json({
      error: "desktop_route_unavailable",
      message: `${name} is not wired in the desktop local server yet.`,
    });
  });
  return router;
}

export async function createApp(options = {}) {
  const app = express();
  const includeDefaultRoutes = options.includeDefaultRoutes !== false;
  const defaultRouters = includeDefaultRoutes ? await loadDefaultRouters() : {};
  const filesRouter = options.filesRouter ?? defaultRouters.filesRouter;
  const logsRouter =
    options.logsRouter ??
    defaultRouters.logsRouter ??
    createUnavailableRouter("logs route");
  const libraryRouter =
    options.libraryRouter ??
    defaultRouters.libraryRouter ??
    createUnavailableRouter("library route");
  const aiSettingsRouter =
    options.aiSettingsRouter ??
    defaultRouters.aiSettingsRouter ??
    createUnavailableRouter("ai settings route");
  const aiPromptPresetsRouter =
    options.aiPromptPresetsRouter ??
    defaultRouters.aiPromptPresetsRouter ??
    createUnavailableRouter("ai prompt presets route");
  const aiProxyRouter =
    options.aiProxyRouter ??
    defaultRouters.aiProxyRouter ??
    createUnavailableRouter("ai proxy route");
  const mindMapAiRouter =
    options.mindMapAiRouter ??
    defaultRouters.mindMapAiRouter ??
    createUnavailableRouter("mindmap ai route");
  const ttdChatsRouter =
    options.ttdChatsRouter ??
    defaultRouters.ttdChatsRouter ??
    createUnavailableRouter("ttd chats route");
  const embedTokenRouter =
    defaultRouters.embedTokenRouter ??
    createUnavailableRouter("embed token route");
  const embedPageRouter =
    defaultRouters.embedPageRouter ??
    createUnavailableRouter("embed page route");
  const serveSpa = options.serveSpa ?? process.env.SERVE_SPA ?? "";
  const httpLog = createLogger({ module: "http" });

  app.use(cors());
  app.use(express.json({ limit: "50mb" }));

  app.use("/api", (req, res, next) => {
    if (
      req.method === "POST" ||
      req.method === "PUT" ||
      req.method === "PATCH"
    ) {
      const cl = req.headers["content-length"];
      httpLog.info(`${req.method} ${req.originalUrl}`, {
        contentLength: cl ?? "(chunked/unknown)",
        ip: req.ip,
        ...clientRequestContext(req),
      });
    }
    const t0 = Date.now();
    res.on("finish", () => {
      const pathname = req.originalUrl.split("?")[0];
      if (pathname === "/api/health") {
        return;
      }

      const traceAll = isHttpTraceEnabled();
      const filesRoute = pathname.startsWith("/api/files");
      if (filesRoute || traceAll) {
        const ms = Date.now() - t0;
        const meta = {
          ms,
          ...clientRequestContext(req),
          ...(traceAll && {
            ip: req.ip,
            ua: truncStr(req.headers["user-agent"] ?? "", 160),
          }),
        };
        if (res.statusCode >= 500) {
          httpLog.error(
            `${req.method} ${req.originalUrl} → ${res.statusCode}`,
            meta,
          );
        } else if (res.statusCode >= 400) {
          httpLog.warn(
            `${req.method} ${req.originalUrl} → ${res.statusCode}`,
            meta,
          );
        } else {
          httpLog.info(
            `${req.method} ${req.originalUrl} → ${res.statusCode}`,
            meta,
          );
        }
      }
    });
    next();
  });

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.get("/api/debug/capability", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      debug: {
        allowed: isDebugLogAllowed(),
      },
    });
  });

  app.use("/api/logs", logsRouter);

  if (!filesRouter) {
    throw new Error("createApp requires a filesRouter");
  }
  app.use("/api/files", filesRouter);
  app.use("/api/library", libraryRouter);
  app.use("/api/ai-settings", aiSettingsRouter);
  app.use("/api/ai-prompt-presets", aiPromptPresetsRouter);
  app.use("/api/ai", aiProxyRouter);
  app.use("/api/mindmap/ai", mindMapAiRouter);
  app.use("/api/ttd-chats", ttdChatsRouter);
  app.use("/api/embed-tokens", embedTokenRouter);

  app.use("/embed", embedPageRouter);

  const root = resolveSpaRoot(serveSpa);
  if (root) {
    if (existsSync(root) && existsSync(path.join(root, "index.html"))) {
      app.use(servePrecompressedStatic(root));
      app.use(
        express.static(root, {
          index: "index.html",
          maxAge: 0,
          etag: true,
          setHeaders: setSpaStaticCacheHeaders,
        }),
      );
      httpLog.info("serving static SPA", { root });
    } else {
      console.warn(
        `[excalidraw-server] SERVE_SPA set but build not found (need index.html): ${root}`,
      );
    }
  }

  const errLog = createLogger({ module: "error" });

  app.use((err, req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }
    if (err instanceof SyntaxError && "body" in err) {
      errLog.warn("invalid JSON body", {
        path: req.originalUrl,
        message: err.message,
      });
      return res
        .status(400)
        .json({ error: "invalid_json", message: err.message });
    }
    if (err.type === "entity.too.large" || err.status === 413) {
      errLog.warn("payload too large", {
        path: req.originalUrl,
        limit: err.limit,
        message: err.message,
      });
      return res.status(413).json({
        error: "payload_too_large",
        message: err.message,
      });
    }
    errLog.error("unhandled request error", {
      path: req.originalUrl,
      method: req.method,
      message: err.message,
      stack: err.stack?.split("\n").slice(0, 5).join("\n"),
    });
    return res
      .status(500)
      .json({ error: "internal_error", message: err.message });
  });

  return app;
}

export default createApp;
