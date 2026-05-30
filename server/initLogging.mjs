import { createLogger } from "./lib/logger.js";
import { initFileLogTransports } from "./lib/rotatingFileTransport.js";
import { resolveLogDir } from "./config/logDir.js";

const logDir = initFileLogTransports();
if (logDir) {
  createLogger({ module: "boot" }).info("file logging enabled", {
    logDir,
    serverLog: "server.log",
    clientLog: "client.log",
  });
}

export { resolveLogDir };
