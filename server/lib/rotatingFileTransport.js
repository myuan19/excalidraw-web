import { mkdirSync } from "fs";

import { createStream } from "rotating-file-stream";

import { createLogSessionId, sessionLogBasename } from "../config/logNaming.js";
import {
  isFileLogEnabled,
  logRotateOptions,
  resolveLogDir,
} from "../config/logDir.js";
import { formatDebugEvent } from "../../lib/logger/core.js";

import { parseByteSize, pruneLogFiles } from "./logPrune.js";

/** @typedef {import("../../lib/logger/core.js").LogEntry} LogEntry */

const logSessionId = createLogSessionId();

function formatLine(entry) {
  return `${formatDebugEvent(entry)}\n`;
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
    process.stderr.write(
      `[log] rotating stream error (${basename}): ${err.message}\n`,
    );
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
let _mergedTransport = null;
let _sessionMeta = null;

function pruneLogDirectory(logDir) {
  const opts = logRotateOptions();
  const serverBasename = sessionLogBasename("server", logSessionId);
  const clientBasename = sessionLogBasename("client", logSessionId);
  const mergedBasename = sessionLogBasename("merged", logSessionId);
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
  const mergedPrune = pruneLogFiles(logDir, {
    prefix: "merged",
    protectBasenames: [mergedBasename],
    maxTotalBytes,
    maxFileCount: opts.maxSessionFiles,
  });

  return {
    serverBasename,
    clientBasename,
    mergedBasename,
    removed: [
      ...serverPrune.removed,
      ...clientPrune.removed,
      ...mergedPrune.removed,
    ],
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

export function getMergedFileTransport() {
  if (!isFileLogEnabled()) {
    return null;
  }
  if (!_mergedTransport) {
    const basename = sessionLogBasename("merged", logSessionId);
    _mergedTransport = openRotatingStream(basename);
  }
  return _mergedTransport;
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
  getMergedFileTransport();

  _sessionMeta = {
    logDir,
    sessionId: logSessionId,
    serverLog: prune.serverBasename,
    clientLog: prune.clientBasename,
    mergedLog: prune.mergedBasename,
    removedOldLogs: prune.removed,
    rotateSize: logRotateOptions().size,
    maxTotalSize: logRotateOptions().maxTotalSize,
  };

  return _sessionMeta;
}
