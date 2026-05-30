import { mkdirSync } from "fs";
import { createStream } from "rotating-file-stream";

import {
  createLogSessionId,
  formatLogTimestamp,
  sessionLogBasename,
} from "../config/logNaming.js";
import { isFileLogEnabled, logRotateOptions, resolveLogDir } from "../config/logDir.js";
import { parseByteSize, pruneLogFiles } from "./logPrune.js";

/** @typedef {import("../../lib/logger/core.js").LogEntry} LogEntry */

const logSessionId = createLogSessionId();

function formatLine(entry) {
  const lvl = entry.level.toUpperCase().padEnd(5);
  const src = `${entry.source}:${entry.module}`;
  const data = entry.data ? ` ${JSON.stringify(entry.data)}` : "";
  const sid = entry.sid ? ` sid=${entry.sid}` : "";
  const ts = formatLogTimestamp(new Date(entry.ts));
  return `${ts} [${lvl}] [${src}] ${entry.msg}${data}${sid}\n`;
}

/**
 * @param {string} basename e.g. server-20260531-005443.log
 * @param {(entry: LogEntry) => boolean} [filter]
 */
function openRotatingStream(basename, filter) {
  const logDir = resolveLogDir();
  if (!logDir) {
    return null;
  }

  mkdirSync(logDir, { recursive: true });
  const opts = logRotateOptions();

  /** @type {import("rotating-file-stream").Options} */
  const streamOpts = {
    path: logDir,
    size: opts.size,
    maxFiles: opts.maxFiles,
    encoding: "utf8",
  };
  if (opts.compress) {
    streamOpts.compress = opts.compress;
  }
  if (opts.interval) {
    streamOpts.interval = opts.interval;
  }

  const stream = createStream(basename, streamOpts);

  stream.on("error", (err) => {
    process.stderr.write(`[log] rotating stream error (${basename}): ${err.message}\n`);
  });

  /** @type {import("../../lib/logger/core.js").LogTransport} */
  const transport = {
    write(entry) {
      if (filter && !filter(entry)) {
        return;
      }
      stream.write(formatLine(entry));
    },
  };

  return transport;
}

let _serverTransport = null;
let _clientTransport = null;
let _sessionMeta = null;

function pruneLogDirectory(logDir) {
  const opts = logRotateOptions();
  const serverBasename = sessionLogBasename("server", logSessionId);
  const clientBasename = sessionLogBasename("client", logSessionId);
  const maxTotalBytes = parseByteSize(opts.maxTotalSize);

  const serverPrune = pruneLogFiles(logDir, {
    prefix: "server",
    protectBasenames: [serverBasename],
    maxTotalBytes,
    maxFileCount: opts.maxSessionFiles,
  });
  const clientPrune = pruneLogFiles(logDir, {
    prefix: "client",
    protectBasenames: [clientBasename],
    maxTotalBytes,
    maxFileCount: opts.maxSessionFiles,
  });

  return {
    serverBasename,
    clientBasename,
    removed: [...serverPrune.removed, ...clientPrune.removed],
  };
}

export function getLogSessionMeta() {
  return _sessionMeta;
}

export function getServerFileTransport() {
  if (!isFileLogEnabled()) {
    return null;
  }
  if (!_serverTransport) {
    const basename = sessionLogBasename("server", logSessionId);
    _serverTransport = openRotatingStream(
      basename,
      (entry) => entry.source === "server",
    );
  }
  return _serverTransport;
}

export function getClientFileTransport() {
  if (!isFileLogEnabled()) {
    return null;
  }
  if (!_clientTransport) {
    const basename = sessionLogBasename("client", logSessionId);
    _clientTransport = openRotatingStream(
      basename,
      (entry) => entry.source === "client",
    );
  }
  return _clientTransport;
}

export function initFileLogTransports() {
  const logDir = resolveLogDir();
  if (!isFileLogEnabled() || !logDir) {
    return null;
  }

  mkdirSync(logDir, { recursive: true });
  const prune = pruneLogDirectory(logDir);
  getServerFileTransport();
  getClientFileTransport();

  _sessionMeta = {
    logDir,
    sessionId: logSessionId,
    serverLog: prune.serverBasename,
    clientLog: prune.clientBasename,
    removedOldLogs: prune.removed,
    rotateSize: logRotateOptions().size,
    maxTotalSize: logRotateOptions().maxTotalSize,
  };

  return _sessionMeta;
}
