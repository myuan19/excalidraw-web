/** @typedef {"trace"|"debug"|"info"|"warn"|"error"|"critical"} LogLevel */
/** @typedef {"client"|"server"} LogSource */
/** @typedef {"FE"|"BE"|"CLI"|"TUI"|"EM"|"ER"|"FL"|"WK"|"SYS"|string} LogComponent */

/** @typedef {Record<string, string | number | boolean | null | undefined>} LogContext */
/** @typedef {Record<string, unknown>} LogFields */

/**
 * @typedef {object} LogEntry
 * @property {string} ts
 * @property {LogLevel} level
 * @property {LogSource} source
 * @property {LogComponent} [component]
 * @property {string} module
 * @property {string} [event]
 * @property {string} msg
 * @property {Record<string, unknown>} [data]
 * @property {LogContext} [context]
 * @property {LogFields} [fields]
 * @property {string} [sourceLocation]
 * @property {number} [sequence]
 * @property {string} [sid]
 * @property {string} [ua]
 */

/**
 * @typedef {object} DebugEventOptions
 * @property {string} [message]
 * @property {LogContext} [context]
 * @property {LogFields} [fields]
 * @property {string} [sourceLocation]
 */

/** @typedef {{ write: (entry: LogEntry) => void }} LogTransport */

/**
 * @typedef {object} LoggerOptions
 * @property {string} module
 * @property {LogSource} source
 * @property {LogComponent} [component]
 * @property {LogContext | (() => LogContext)} [context]
 * @property {LogLevel | (() => LogLevel)} [minLevel]
 * @property {LogTransport[]} transports
 */

/** @type {Record<LogLevel, number>} */
export const LEVEL_VALUE = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  critical: 5,
};

const COMPONENT_BY_SOURCE = {
  client: "FE",
  server: "BE",
};

const REDACTED = "[redacted]";
const SENSITIVE_KEY_RE =
  /(?:api[-_]?key|authorization|cookie|credential|password|secret|token)/i;
const DEFAULT_MAX_STRING_LENGTH = 2048;
const CONTEXT_MAX_STRING_LENGTH = 256;
const MAX_OBJECT_DEPTH = 2;

let globalSequence = 0;

export function componentForSource(source) {
  return COMPONENT_BY_SOURCE[source] ?? String(source || "SYS").toUpperCase();
}

export function normalizeLogData(data) {
  if (data === undefined || data === null) {
    return undefined;
  }
  if (data instanceof Error) {
    return {
      message: data.message,
      name: data.name,
      stack: data.stack?.split("\n").slice(0, 5).join("\n"),
    };
  }
  if (typeof data === "object" && !Array.isArray(data)) {
    return /** @type {Record<string, unknown>} */ (data);
  }
  return { value: data };
}

export function isSensitiveLogKey(key) {
  return SENSITIVE_KEY_RE.test(key);
}

function truncateString(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...[truncated:${
    value.length - maxLength
  }]`;
}

function sanitizeLogValue(value, opts) {
  if (typeof value === "string") {
    return truncateString(value, opts.maxStringLength);
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Error) {
    return sanitizeLogRecord(normalizeLogData(value), {
      maxStringLength: opts.maxStringLength,
      depth: opts.depth + 1,
    });
  }
  if (opts.depth >= MAX_OBJECT_DEPTH) {
    try {
      return truncateString(JSON.stringify(value), opts.maxStringLength);
    } catch {
      return "[unserializable]";
    }
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) =>
      sanitizeLogValue(item, {
        maxStringLength: opts.maxStringLength,
        depth: opts.depth + 1,
      }),
    );
  }
  if (typeof value === "object") {
    return sanitizeLogRecord(/** @type {Record<string, unknown>} */ (value), {
      maxStringLength: opts.maxStringLength,
      depth: opts.depth + 1,
    });
  }
  return String(value);
}

export function sanitizeLogRecord(record, opts = {}) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return undefined;
  }
  const out = {};
  const maxStringLength = opts.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH;
  const depth = opts.depth ?? 0;
  for (const [key, value] of Object.entries(record)) {
    if (isSensitiveLogKey(key)) {
      out[key] = REDACTED;
      continue;
    }
    out[key] = sanitizeLogValue(value, { maxStringLength, depth });
  }
  return out;
}

function legacyEventName(module) {
  return `${module || "unknown"}.log`;
}

function quoteFieldValue(value) {
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "undefined";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  const text =
    typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
  return /^[A-Za-z0-9_.:/@-]+$/.test(text)
    ? text
    : `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export function formatKeyValuePairs(values) {
  if (!values) {
    return "";
  }
  return Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${quoteFieldValue(value)}`)
    .join(" ");
}

export function formatDebugEvent(entry) {
  const component = entry.component ?? componentForSource(entry.source);
  const sourceLocation = entry.sourceLocation ?? "-";
  const context = formatKeyValuePairs(
    sanitizeLogRecord(entry.context, {
      maxStringLength: CONTEXT_MAX_STRING_LENGTH,
    }),
  );
  const fields = formatKeyValuePairs({
    ...(entry.sid ? { sid: entry.sid } : {}),
    ...(sanitizeLogRecord(entry.fields ?? entry.data) ?? {}),
  });
  const event = entry.event ?? legacyEventName(entry.module);
  const message = entry.msg || "-";
  const contextColumn = context || "-";
  const base = `${
    entry.ts
  } | ${entry.level.toUpperCase()} | ${component} | ${sourceLocation} | ${contextColumn} | ${event} - ${message}`;
  return fields ? `${base} | ${fields}` : base;
}

export class Logger {
  /** @param {LoggerOptions} opts */
  constructor({
    module,
    source,
    component,
    context,
    minLevel = "info",
    transports,
  }) {
    this._module = module;
    this._source = source;
    this._component = component ?? componentForSource(source);
    this._context = context ?? {};
    this._minLevel = minLevel;
    this._transports = transports;
  }

  /** @param {string} msg @param {unknown} [data] */
  debug(msg, data) {
    this._log("debug", msg, data);
  }
  /** @param {string} msg @param {unknown} [data] */
  trace(msg, data) {
    this._log("trace", msg, data);
  }
  /** @param {string} msg @param {unknown} [data] */
  info(msg, data) {
    this._log("info", msg, data);
  }
  /** @param {string} msg @param {unknown} [data] */
  warn(msg, data) {
    this._log("warn", msg, data);
  }
  /** @param {string} msg @param {unknown} [data] */
  error(msg, data) {
    this._log("error", msg, data);
  }
  /** @param {string} msg @param {unknown} [data] */
  critical(msg, data) {
    this._log("critical", msg, data);
  }

  /**
   * @param {LogLevel} level
   * @param {string} event
   * @param {string} message
   * @param {DebugEventOptions} [opts]
   */
  event(level, event, message, opts) {
    this._emit(level, {
      event,
      msg: message,
      context: opts?.context,
      fields: opts?.fields,
      sourceLocation: opts?.sourceLocation,
    });
  }

  /**
   * @param {LogLevel} level
   * @param {string} msg
   * @param {unknown} [data]
   */
  _log(level, msg, data) {
    this._emit(level, {
      event: legacyEventName(this._module),
      msg,
      data: normalizeLogData(data),
      fields: normalizeLogData(data),
    });
  }

  /**
   * @param {LogLevel} level
   * @param {Partial<LogEntry>} payload
   */
  _emit(level, payload) {
    const minLevel =
      typeof this._minLevel === "function" ? this._minLevel() : this._minLevel;
    if (LEVEL_VALUE[level] < (LEVEL_VALUE[minLevel] ?? 1)) {
      return;
    }

    const loggerContext =
      typeof this._context === "function" ? this._context() : this._context;
    const context = sanitizeLogRecord(
      {
        ...loggerContext,
        ...(payload.context ?? {}),
      },
      { maxStringLength: CONTEXT_MAX_STRING_LENGTH },
    );
    /** @type {LogEntry} */
    const entry = {
      ts: new Date().toISOString(),
      level,
      source: this._source,
      component: this._component,
      module: this._module,
      event: payload.event,
      msg: payload.msg ?? "",
      context,
      sourceLocation: payload.sourceLocation,
      sequence: ++globalSequence,
    };
    if (payload.data) {
      entry.data = sanitizeLogRecord(
        /** @type {Record<string, unknown>} */ (payload.data),
      );
    }
    if (payload.fields) {
      entry.fields = sanitizeLogRecord(
        /** @type {Record<string, unknown>} */ (payload.fields),
      );
    }

    for (const t of this._transports) {
      try {
        t.write(entry);
      } catch {
        // transport failure must not crash app
      }
    }
  }
}
