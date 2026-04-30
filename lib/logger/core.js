/** @typedef {"debug"|"info"|"warn"|"error"} LogLevel */
/** @typedef {"client"|"server"} LogSource */

/**
 * @typedef {object} LogEntry
 * @property {string}  ts     - ISO 8601
 * @property {LogLevel} level
 * @property {LogSource} source
 * @property {string}  module
 * @property {string}  msg
 * @property {Record<string,unknown>} [data]
 * @property {string}  [sid]  - client session id
 * @property {string}  [ua]   - user-agent (client only)
 */

/**
 * @typedef {object} LogTransport
 * @property {(entry: LogEntry) => void} write
 */

/** @type {Record<LogLevel, number>} */
export const LEVEL_VALUE = { debug: 0, info: 1, warn: 2, error: 3 };

export class Logger {
  /**
   * @param {object} opts
   * @param {string}  opts.module
   * @param {LogSource} opts.source
   * @param {LogLevel} [opts.minLevel]
   * @param {LogTransport[]} opts.transports
   */
  constructor({ module, source, minLevel = "info", transports }) {
    this._module = module;
    this._source = source;
    this._minLevel = LEVEL_VALUE[minLevel] ?? 1;
    this._transports = transports;
  }

  /** @param {string} msg @param {unknown} [data] */
  debug(msg, data) { this._log("debug", msg, data); }
  /** @param {string} msg @param {unknown} [data] */
  info(msg, data) { this._log("info", msg, data); }
  /** @param {string} msg @param {unknown} [data] */
  warn(msg, data) { this._log("warn", msg, data); }
  /** @param {string} msg @param {unknown} [data] */
  error(msg, data) { this._log("error", msg, data); }

  /**
   * @param {LogLevel} level
   * @param {string} msg
   * @param {unknown} [data]
   */
  _log(level, msg, data) {
    if (LEVEL_VALUE[level] < this._minLevel) return;

    /** @type {LogEntry} */
    const entry = {
      ts: new Date().toISOString(),
      level,
      source: this._source,
      module: this._module,
      msg,
    };
    if (data !== undefined && data !== null) {
      if (data instanceof Error) {
        entry.data = {
          message: data.message,
          name: data.name,
          stack: data.stack?.split("\n").slice(0, 5).join("\n"),
        };
      } else if (typeof data === "object" && !Array.isArray(data)) {
        entry.data = /** @type {Record<string, unknown>} */ (data);
      } else {
        entry.data = { value: data };
      }
    }

    for (const t of this._transports) {
      try { t.write(entry); } catch { /* transport failure must not crash app */ }
    }
  }
}
