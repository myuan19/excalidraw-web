import { Logger, LEVEL_VALUE, formatDebugEvent } from "../../lib/logger/core.js";
import {
  getClientFileTransport,
  getMergedFileTransport,
  getServerFileTransport,
} from "./rotatingFileTransport.js";

/** @typedef {import("../../lib/logger/core.js").LogEntry} LogEntry */

class StdoutTransport {
  /** @param {LogEntry} entry */
  write(entry) {
    process.stdout.write(`${formatDebugEvent(entry)}\n`);
  }
}

const minLevel = (() => {
  const v = (process.env.LOG_LEVEL ?? "").trim().toLowerCase();
  if (v && v in LEVEL_VALUE) return v;
  return "info";
})();

const transports = [new StdoutTransport()];

const serverFile = getServerFileTransport();
if (serverFile) transports.push(serverFile);

const clientFile = getClientFileTransport();
if (clientFile) transports.push(clientFile);

const mergedFile = getMergedFileTransport();
if (mergedFile) transports.push(mergedFile);

/**
 * @param {{ module: string }} opts
 * @returns {Logger}
 */
export function createLogger(opts) {
  return new Logger({
    module: opts.module,
    source: "server",
    minLevel,
    transports,
  });
}

export { transports as _transports };
