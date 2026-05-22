import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import filesRouter from "./routes/files.js";
import libraryRouter from "./routes/library.js";
import aiSettingsRouter from "./routes/ai-settings.js";
import ttdChatsRouter from "./routes/ttd-chats.js";
import logsRouter from "./routes/logs.js";
import { tokenRouter as embedTokenRouter, pageRouter as embedPageRouter } from "./routes/embed.js";
import { createLogger } from "./lib/logger.js";
import {
  isClientLogIngestEnabled,
  isHttpTraceEnabled,
  truncStr,
} from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3033;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

const httpLog = createLogger({ module: "http" });

app.use("/api", (req, res, next) => {
  if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
    const cl = req.headers["content-length"];
    httpLog.info(`${req.method} ${req.originalUrl}`, {
      contentLength: cl ?? "(chunked/unknown)",
      ip: req.ip,
    });
  }
  const t0 = Date.now();
  res.on("finish", () => {
    const pathname = req.originalUrl.split("?")[0];
    if (pathname === "/api/health") return;

    const traceAll = isHttpTraceEnabled();
    const filesRoute = pathname.startsWith("/api/files");
    if (filesRoute || traceAll) {
      const ms = Date.now() - t0;
      const meta = {
        ms,
        ...(traceAll && {
          ip: req.ip,
          ua: truncStr(req.headers["user-agent"] ?? "", 160),
        }),
      };
      if (res.statusCode >= 500) {
        httpLog.error(`${req.method} ${req.originalUrl} → ${res.statusCode}`, meta);
      } else if (res.statusCode >= 400) {
        httpLog.warn(`${req.method} ${req.originalUrl} → ${res.statusCode}`, meta);
      } else {
        httpLog.info(`${req.method} ${req.originalUrl} → ${res.statusCode}`, meta);
      }
    }
  });
  next();
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/logs", logsRouter);

app.use("/api/files", filesRouter);
app.use("/api/library", libraryRouter);
app.use("/api/ai-settings", aiSettingsRouter);
app.use("/api/ttd-chats", ttdChatsRouter);
app.use("/api/embed-tokens", embedTokenRouter);

app.use("/embed", embedPageRouter);

/**
 * 与 API 同机部署时，同一端口托管 `app/build`（`./assets/*.js` 等），避免只起了 API 而静态资源 404。
 * 用法：`SERVE_SPA=1 node server/index.js` 或 `SERVE_SPA=/绝对路径/到/build`
 */
{
  const raw = (process.env.SERVE_SPA || "").trim();
  if (raw) {
    const root =
      raw === "1" || raw === "true"
        ? path.join(__dirname, "../app/build")
        : path.isAbsolute(raw)
          ? raw
          : path.join(__dirname, raw);
    if (existsSync(root) && existsSync(path.join(root, "index.html"))) {
      app.use(
        express.static(root, { index: "index.html", maxAge: 0, etag: true }),
      );
      console.log(`[excalidraw-server] also serving static from ${root}`);
    } else {
      console.warn(
        `[excalidraw-server] SERVE_SPA set but build not found (need index.html): ${root}`,
      );
    }
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
    return res.status(400).json({ error: "invalid_json", message: err.message });
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
  res.status(500).json({ error: "internal_error", message: err.message });
});

const HOST = process.env.LISTEN_HOST || "0.0.0.0";
const bootLog = createLogger({ module: "boot" });

process.on("uncaughtException", (err) => {
  const pLog = createLogger({ module: "process" });
  pLog.error("uncaught exception", { message: err.message, stack: err.stack });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  const pLog = createLogger({ module: "process" });
  pLog.error("unhandled rejection", { reason: String(reason) });
});

app.listen(PORT, HOST, () => {
  bootLog.info(`listening on http://${HOST}:${PORT}`);
  bootLog.info("config", {
    LOG_LEVEL: process.env.LOG_LEVEL || "info",
    HTTP_TRACE: isHttpTraceEnabled(),
    CLIENT_INGEST: isClientLogIngestEnabled(),
  });
});
