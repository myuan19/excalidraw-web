import { mkdirSync } from "fs";
import { createStream } from "rotating-file-stream";

import { isFileLogEnabled, logRotateOptions, resolveLogDir } from "../config/logDir.js";

/** @typedef {import("../../lib/logger/core.js").LogEntry} LogEntry */

function formatLine(entry) {
  const lvl = entry.level.toUpperCase().padEnd(5);
  const src = `${entry.source}:${entry.module}`;
  const data = entry.data ? ` ${JSON.stringify(entry.data)}` : "";
  const sid = entry.sid ? ` sid=${entry.sid}` : "";
  return `${entry.ts} [${lvl}] [${src}] ${entry.msg}${data}${sid}\n`;
}

/**
 * @param {string} basename e.g. server.log
 * @param {(entry: LogEntry) => boolean} [filter]
 */
function openRotatingStream(basename, filter) {
  const logDir = resolveLogDir();
  if (!logDir) return null;

  mkdirSync(logDir, { recursive: true });
  const opts = logRotateOptions();

  const stream = createStream(basename, {
    path: logDir,
    size: opts.size,
    interval: opts.interval,
    maxFiles: opts.maxFiles,
    maxSize: opts.maxSize,
    compress: opts.compress,
    encoding: "utf8",
  });

  stream.on("error", (err) => {
    process.stderr.write(`[log] rotating stream error (${basename}): ${err.message}\n`);
  });

  /** @type {import("../../lib/logger/core.js").LogTransport} */
  const transport = {
    write(entry) {
      if (filter && !filter(entry)) return;
      stream.write(formatLine(entry));
    },
  };

  return transport;
}

let _serverTransport = null;
let _clientTransport = null;

export function getServerFileTransport() {
  if (!isFileLogEnabled()) return null;
  if (!_serverTransport) {
    _serverTransport = openRotatingStream(
      "server.log",
      (entry) => entry.source === "server",
    );
  }
  return _serverTransport;
}

export function getClientFileTransport() {
  if (!isFileLogEnabled()) return null;
  if (!_clientTransport) {
    _clientTransport = openRotatingStream(
      "client.log",
      (entry) => entry.source === "client",
    );
  }
  return _clientTransport;
}

export function initFileLogTransports() {
  const logDir = resolveLogDir();
  if (!isFileLogEnabled() || !logDir) return null;
  mkdirSync(logDir, { recursive: true });
  getServerFileTransport();
  getClientFileTransport();
  return logDir;
}
