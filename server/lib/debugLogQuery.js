const COLUMN_SEP = " | ";

function splitEventMessage(value) {
  const marker = " - ";
  const idx = value.indexOf(marker);
  if (idx < 0) {
    return { event: value, message: "" };
  }
  return {
    event: value.slice(0, idx),
    message: value.slice(idx + marker.length),
  };
}

function parseValue(raw) {
  if (raw === "null") return null;
  if (raw === "undefined") return undefined;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  if (raw.startsWith('"') && raw.endsWith('"')) {
    return raw
      .slice(1, -1)
      .replaceAll('\\"', '"')
      .replaceAll("\\\\", "\\");
  }
  return raw;
}

export function parseKeyValuePairs(text) {
  if (!text || text === "-") {
    return {};
  }
  const out = {};
  const re = /([A-Za-z0-9_.:-]+)=("(?:\\.|[^"])*"|[^ ]*)/g;
  for (const match of text.matchAll(re)) {
    out[match[1]] = parseValue(match[2]);
  }
  return out;
}

export function parseDebugLogLine(line) {
  const parts = line.split(COLUMN_SEP);
  if (parts.length < 6) {
    return null;
  }
  const [ts, level, component, sourceLocation, contextText, eventText] = parts;
  const { event, message } = splitEventMessage(eventText);
  const fieldsText = parts.slice(6).join(COLUMN_SEP);
  return {
    ts,
    level: level.toLowerCase(),
    component,
    sourceLocation: sourceLocation === "-" ? null : sourceLocation,
    context: parseKeyValuePairs(contextText),
    event,
    message,
    fields: parseKeyValuePairs(fieldsText),
    line,
  };
}

function fieldValue(entry, key) {
  if (key in entry.context) return entry.context[key];
  if (key in entry.fields) return entry.fields[key];
  return entry[key];
}

function matchesPattern(value, pattern) {
  if (!pattern) {
    return true;
  }
  const text = String(value ?? "");
  if (pattern.includes("*")) {
    const escaped = pattern
      .split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*");
    return new RegExp(`^${escaped}$`).test(text);
  }
  return text === pattern || text.startsWith(pattern);
}

export function matchesDebugLogEntry(entry, filters = {}) {
  if (!entry) {
    return false;
  }
  if (filters.event && !matchesPattern(entry.event, filters.event)) {
    return false;
  }
  if (
    filters.level &&
    String(entry.level).toLowerCase() !== String(filters.level).toLowerCase()
  ) {
    return false;
  }
  if (
    filters.component &&
    String(entry.component).toLowerCase() !==
      String(filters.component).toLowerCase()
  ) {
    return false;
  }
  if (filters.grep) {
    const needle = String(filters.grep).toLowerCase();
    if (!entry.line.toLowerCase().includes(needle)) {
      return false;
    }
  }
  for (const [key, expected] of Object.entries(filters.fields ?? {})) {
    const actual = fieldValue(entry, key);
    if (String(actual ?? "") !== String(expected)) {
      return false;
    }
  }
  return true;
}

export function filterDebugLogLines(lines, filters = {}) {
  return lines
    .map(parseDebugLogLine)
    .filter((entry) => matchesDebugLogEntry(entry, filters));
}
