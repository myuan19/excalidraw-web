#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";

import {
  filterDebugLogLines,
  matchesDebugLogEntry,
} from "../server/lib/debugLogQuery.js";
import { resolveLogDir } from "../server/config/logDir.js";

const USAGE = `Usage:
  yarn dlog [options]

Options:
  --log <path>          Read a specific log file
  --kind <kind>         Log kind when --log is omitted: merged, server, client (default: merged)
  --event <pattern>     Event prefix/exact/wildcard, e.g. save.queue or doc.version.*
  --level <level>       Exact level: trace, debug, info, warn, error, critical
  --component <name>    Component column, e.g. FE or BE
  --run <id>            Match context run
  --case <id>           Match context case
  --trace <id>          Match context trace
  --request <id>        Match context request
  --tab <id>            Match context tab
  --file <id8>          Match fileId8/fileId/id in fields
  --field <key=value>   Match any context/field/top-level key (repeatable)
  --grep <text>         Case-insensitive substring against the raw line
  --limit <n>           Max rows to print, from newest matches (default: 80)
  --json                Print parsed JSON lines instead of raw log lines
  --list                Print available log files and exit
  --help                Show this help
`;

function parseArgs(argv) {
  const out = {
    kind: "merged",
    fields: {},
    limit: 80,
    json: false,
    list: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) {
        throw new Error(`${arg} requires a value`);
      }
      return argv[i];
    };
    if (arg === "--help" || arg === "-h") {
      out.help = true;
    } else if (arg === "--json") {
      out.json = true;
    } else if (arg === "--list") {
      out.list = true;
    } else if (arg === "--log") {
      out.log = next();
    } else if (arg === "--kind") {
      out.kind = next();
    } else if (arg === "--event") {
      out.event = next();
    } else if (arg === "--level") {
      out.level = next();
    } else if (arg === "--component") {
      out.component = next();
    } else if (arg === "--run") {
      out.fields.run = next();
    } else if (arg === "--case") {
      out.fields.case = next();
    } else if (arg === "--trace") {
      out.fields.trace = next();
    } else if (arg === "--request") {
      out.fields.request = next();
    } else if (arg === "--tab") {
      out.fields.tab = next();
    } else if (arg === "--file") {
      const value = next();
      out.fields.fileId8 = value;
      out.fields.fileId = value;
      out.fields.id = value;
    } else if (arg === "--field") {
      const value = next();
      const eq = value.indexOf("=");
      if (eq <= 0) {
        throw new Error("--field expects key=value");
      }
      out.fields[value.slice(0, eq)] = value.slice(eq + 1);
    } else if (arg === "--grep") {
      out.grep = next();
    } else if (arg === "--limit") {
      out.limit = Number.parseInt(next(), 10);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return out;
}

function listLogFiles(logDir) {
  if (!logDir || !existsSync(logDir)) {
    return [];
  }
  return readdirSync(logDir)
    .filter((name) => /^(merged|server|client)-.+\.log(?:\.\d+)?$/.test(name))
    .map((name) => {
      const fullPath = join(logDir, name);
      return { name, path: fullPath, mtimeMs: statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function latestLogPath(logDir, kind) {
  const prefix = `${kind}-`;
  return listLogFiles(logDir).find((file) => file.name.startsWith(prefix))
    ?.path;
}

function readLines(path) {
  return readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
}

function normalizeFileFieldFilter(fields) {
  if (!("fileId8" in fields)) {
    return fields;
  }
  const { fileId8, fileId, id, ...rest } = fields;
  return { ...rest, __fileAny: { fileId8, fileId, id } };
}

function matchFileAliases(entry, expected) {
  if (!expected) {
    return true;
  }
  const values = [entry.fields.fileId8, entry.fields.fileId, entry.fields.id];
  return values.some(
    (value) => String(value ?? "") === String(expected.fileId8),
  );
}

function applyFileAliasFilter(entries, fields) {
  const normalized = normalizeFileFieldFilter(fields);
  if (!normalized.__fileAny) {
    return { entries, fields };
  }
  const { __fileAny, ...rest } = normalized;
  return {
    entries: entries.filter((entry) => matchFileAliases(entry, __fileAny)),
    fields: rest,
  };
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${USAGE}`);
    process.exitCode = 2;
    return;
  }

  if (args.help) {
    process.stdout.write(USAGE);
    return;
  }

  const logDir = resolveLogDir();
  if (args.list) {
    for (const file of listLogFiles(logDir)) {
      process.stdout.write(`${file.name}\t${file.path}\n`);
    }
    return;
  }

  const logPath = args.log
    ? resolve(args.log)
    : latestLogPath(logDir, args.kind);
  if (!logPath) {
    process.stderr.write(
      `No ${args.kind} log found. Use --log <path> or check EXCALIDRAW_LOG_DIR.\n`,
    );
    process.exitCode = 1;
    return;
  }

  const lines = readLines(logPath);
  const parsed = filterDebugLogLines(lines, {
    event: args.event,
    level: args.level,
    component: args.component,
    grep: args.grep,
  });
  const aliasFiltered = applyFileAliasFilter(parsed, args.fields);
  const matches = aliasFiltered.entries.filter((entry) =>
    matchesDebugLogEntry(entry, { fields: aliasFiltered.fields }),
  );
  const limit = Number.isFinite(args.limit) && args.limit > 0 ? args.limit : 80;
  const selected = matches.slice(-limit);
  for (const entry of selected) {
    process.stdout.write(`${args.json ? JSON.stringify(entry) : entry.line}\n`);
  }
}

main();
