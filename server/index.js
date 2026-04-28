import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import filesRouter from "./routes/files.js";
import libraryRouter from "./routes/library.js";
import aiSettingsRouter from "./routes/ai-settings.js";
import clientLogsRouter from "./routes/client-logs.js";
import {
  apiLog,
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

/** 导入/保存等大请求：记录方法与 Content-Length，便于对照 413、超时 */
app.use("/api", (req, res, next) => {
  if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
    const cl = req.headers["content-length"];
    apiLog("http", `${req.method} ${req.originalUrl}`, {
      contentLength: cl ?? "(chunked/unknown)",
      ip: req.ip,
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
      apiLog("http", `${req.method} ${req.originalUrl} → ${res.statusCode}`, {
        ms: Date.now() - t0,
        ...(traceAll && {
          ip: req.ip,
          ua: truncStr(req.headers["user-agent"] ?? "", 160),
        }),
      });
    }
  });
  next();
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/client-logs", clientLogsRouter);

app.use("/api/files", filesRouter);
app.use("/api/library", libraryRouter);
app.use("/api/ai-settings", aiSettingsRouter);

/**
 * 与 API 同机部署时，同一端口托管 `excalidraw-app/build`（`./assets/*.js` 等），避免只起了 API 而静态资源 404。
 * 用法：`SERVE_SPA=1 node server/index.js` 或 `SERVE_SPA=/绝对路径/到/build`
 */
{
  const raw = (process.env.SERVE_SPA || "").trim();
  if (raw) {
    const root =
      raw === "1" || raw === "true"
        ? path.join(__dirname, "../excalidraw-app/build")
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

/** 须放在所有路由之后：JSON 解析失败、body 超限（导入大场景时常见） */
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  if (err instanceof SyntaxError && "body" in err) {
    apiLog("json", "invalid JSON body", {
      path: req.originalUrl,
      message: err.message,
    });
    return res.status(400).json({ error: "invalid_json", message: err.message });
  }
  if (err.type === "entity.too.large" || err.status === 413) {
    apiLog("json", "payload too large", {
      path: req.originalUrl,
      limit: err.limit,
      message: err.message,
    });
    return res.status(413).json({
      error: "payload_too_large",
      message: err.message,
    });
  }
  apiLog("error", "unhandled", {
    path: req.originalUrl,
    message: err.message,
    stack: err.stack?.split("\n").slice(0, 5).join("\n"),
  });
  res.status(500).json({ error: "internal_error", message: err.message });
});

const HOST = process.env.LISTEN_HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`[excalidraw-server] listening on http://${HOST}:${PORT}`);
  console.log(
    "[excalidraw-server] [excalidraw-api] 行会进 stdout（docker logs 可见）；EXCALIDRAW_API_DEBUG=1 更细；EXCALIDRAW_HTTP_TRACE=1 时除 /api/health 外每条 API 都会打完成行（官方镜像默认开启，可设 0 关闭）",
  );
  if (isClientLogIngestEnabled()) {
    console.log(
      "[excalidraw-server] 前端日志 ingest 已启用（默认）：EXCALIDRAW_DATA_DIR/logs/client.log（[excalidraw-api] [client] 摘要）；关闭服务端：EXCALIDRAW_CLIENT_LOG=0；关闭浏览器上报：localStorage excalidraw-web-remote-log=0 或 VITE_APP_CLIENT_LOG_TO_SERVER=0",
    );
  } else {
    console.log(
      "[excalidraw-server] 前端日志 ingest 已关闭（EXCALIDRAW_CLIENT_LOG=0/false/off）",
    );
  }
  console.log(
    "[excalidraw-server] 缩略图审计：EXCALIDRAW_THUMB_AUDIT_LOG=1 时 [thumb-send] 带 SVG 字节数（docker logs 可见）；=0 关闭。官方镜像/entrypoint 默认 1。",
  );
});
