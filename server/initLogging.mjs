import { createLogger } from "./lib/logger.js";
import { initFileLogTransports } from "./lib/rotatingFileTransport.js";
import { resolveLogDir } from "./config/logDir.js";

const session = initFileLogTransports();
if (session) {
  createLogger({ module: "boot" }).info("file logging enabled", {
    logDir: session.logDir,
    sessionId: session.sessionId,
    serverLog: session.serverLog,
    clientLog: session.clientLog,
    rotateSize: session.rotateSize,
    maxTotalSize: session.maxTotalSize,
    removedOldLogs: session.removedOldLogs.length,
  });
}

export { resolveLogDir };
