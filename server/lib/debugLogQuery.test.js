import { describe, expect, it } from "vitest";

import {
  filterDebugLogLines,
  matchesDebugLogEntry,
  parseDebugLogLine,
  parseKeyValuePairs,
} from "./debugLogQuery.js";

const LINE =
  '2026-06-18T23:00:00.000+08:00 | INFO | FE | app/data/saveQueue.ts:drain:211 | run=RUN1 tab=TAB1 trace=TRACE1 | save.queue.save.start - save start | fileId8=66a58376 reason="auto save" saved=true count=2';

describe("debugLogQuery", () => {
  it("parses fixed-column debug log lines", () => {
    const entry = parseDebugLogLine(LINE);

    expect(entry).toMatchObject({
      ts: "2026-06-18T23:00:00.000+08:00",
      level: "info",
      component: "FE",
      sourceLocation: "app/data/saveQueue.ts:drain:211",
      event: "save.queue.save.start",
      message: "save start",
      context: { run: "RUN1", tab: "TAB1", trace: "TRACE1" },
      fields: {
        fileId8: "66a58376",
        reason: "auto save",
        saved: true,
        count: 2,
      },
    });
  });

  it("parses quoted and primitive key-value pairs", () => {
    expect(
      parseKeyValuePairs('a=1 b=true c=null d="hello world" e=plain'),
    ).toEqual({
      a: 1,
      b: true,
      c: null,
      d: "hello world",
      e: "plain",
    });
  });

  it("matches event prefixes and wildcard patterns", () => {
    const entry = parseDebugLogLine(LINE);

    expect(matchesDebugLogEntry(entry, { event: "save.queue" })).toBe(true);
    expect(matchesDebugLogEntry(entry, { event: "save.*.save.start" })).toBe(
      true,
    );
    expect(matchesDebugLogEntry(entry, { event: "doc.version" })).toBe(false);
  });

  it("filters by context, fields, component, level, and grep", () => {
    const lines = [
      LINE,
      "2026-06-18T23:00:01.000+08:00 | WARN | BE | - | trace=TRACE2 | doc.version.server_conflict - server-conflict | fileId8=99999999",
    ];

    expect(
      filterDebugLogLines(lines, {
        component: "FE",
        level: "info",
        grep: "auto save",
        fields: { trace: "TRACE1", fileId8: "66a58376" },
      }),
    ).toHaveLength(1);
  });
});
