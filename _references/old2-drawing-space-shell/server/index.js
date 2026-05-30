import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import express from "express";
import filesRouter from "./routes/files.js";
import aiSettingsRouter from "./routes/ai-settings.js";
import embedTokensRouter from "./routes/embed-tokens.js";
import embedRouter from "./routes/embed.js";
import libraryRouter from "./routes/library.js";
import ttdChatsRouter from "./routes/ttd-chats.js";
import logsRouter from "./routes/logs.js";
import { createLogger } from "./lib/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 3033);
const HOST = process.env.LISTEN_HOST || "0.0.0.0";
const log = createLogger({ module: "boot" });
const httpLog = createLogger({ module: "http" });

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "debug";
    httpLog[level](`${req.method} ${req.originalUrl}`, {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: Number(durationMs.toFixed(1)),
      content_length: res.getHeader("content-length") ?? null,
    });
  });
  next();
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/files", filesRouter);
app.use("/api/ai-settings", aiSettingsRouter);
app.use("/api/embed-tokens", embedTokensRouter);
app.use("/api/library", libraryRouter);
app.use("/api/ttd-chats", ttdChatsRouter);
app.use("/api/logs", logsRouter);
app.use("/embed", embedRouter);

const serveSpa = (process.env.SERVE_SPA || "").trim();
if (serveSpa) {
  const root = serveSpa === "1" || serveSpa === "true"
    ? path.join(__dirname, "../dist")
    : path.isAbsolute(serveSpa)
      ? serveSpa
      : path.join(__dirname, serveSpa);
  if (existsSync(path.join(root, "index.html"))) {
    app.use(express.static(root, { index: "index.html", maxAge: 0, etag: true }));
    app.get("*", (_req, res) => res.sendFile(path.join(root, "index.html")));
  }
}

app.use((err, req, res, _next) => {
  if (err instanceof SyntaxError && "body" in err) {
    createLogger({ module: "error" }).warn("invalid JSON body", {
      path: req.originalUrl,
      message: err.message,
    });
    return res.status(400).json({ error: "invalid_json", message: err.message });
  }
  if (err.type === "entity.too.large" || err.status === 413) {
    createLogger({ module: "error" }).warn("payload too large", {
      path: req.originalUrl,
      message: err.message,
    });
    return res.status(413).json({ error: "payload_too_large", message: err.message });
  }
  createLogger({ module: "error" }).error(`${req.method} ${req.originalUrl}`, {
    message: err.message,
  });
  res.status(err.status || 500).json({ error: "internal_error", message: err.message });
});

process.on("uncaughtException", (err) => {
  createLogger({ module: "process" }).error("uncaught exception", {
    message: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  createLogger({ module: "process" }).error("unhandled rejection", {
    reason: String(reason),
  });
});

app.listen(PORT, HOST, () => {
  log.info(`listening on http://${HOST}:${PORT}`);
});
