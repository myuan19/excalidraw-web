import { createApp } from "./createApp.js";
import { createLogger } from "./lib/logger.js";
import {
  isClientLogIngestEnabled,
  isDebugLogAllowed,
  isHttpTraceEnabled,
} from "./logger.js";

const app = await createApp();
const PORT = process.env.PORT || 3033;

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
    DEBUG_ALLOWED: isDebugLogAllowed(),
    HTTP_TRACE: isHttpTraceEnabled(),
    CLIENT_INGEST: isClientLogIngestEnabled(),
  });
});
