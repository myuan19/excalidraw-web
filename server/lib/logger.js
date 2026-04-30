import { Logger, LEVEL_VALUE } from "../../lib/logger/core.js";

/** @typedef {import("../../lib/logger/core.js").LogEntry} LogEntry */

class StdoutTransport {
  /** @param {LogEntry} entry */
  write(entry) {
    const lvl = entry.level.toUpperCase().padEnd(5);
    const src = `${entry.source}:${entry.module}`;
    const data = entry.data ? " " + JSON.stringify(entry.data) : "";
    process.stdout.write(`${entry.ts} [${lvl}] [${src}] ${entry.msg}${data}\n`);
  }
}

const minLevel = (() => {
  const v = (process.env.LOG_LEVEL ?? "").trim().toLowerCase();
  if (v && v in LEVEL_VALUE) return v;
  return "info";
})();

const transports = [new StdoutTransport()];

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
