import { describe, expect, it } from "vitest";

import { formatDebugEvent } from "../../lib/logger/core.js";

import {
  filterDebugLogLines,
  parseDebugLogLine,
  parseKeyValuePairs,
} from "./debugLogQuery.js";

describe("debugLogQuery", () => {
  it("parses fixed-column debug event log lines", () => {
    const line = formatDebugEvent({
      ts: "2026-06-19T18:00:00.000Z",
      level: "info",
      source: "server",
      component: "BE",
      module: "sync",
      event: "doc.version.save",
      msg: "saved",
      context: { run: "run-1", trace: "trace-1" },
      fields: { fileId8: "abcd1234", version: 2 },
    });

    expect(parseDebugLogLine(line)).toMatchObject({
      ts: "2026-06-19T18:00:00.000Z",
      level: "info",
      component: "BE",
      event: "doc.version.save",
      message: "saved",
      context: { run: "run-1", trace: "trace-1" },
      fields: { fileId8: "abcd1234", version: 2 },
    });
  });

  it("filters by event pattern and context/field values", () => {
    const lines = [
      "2026-06-19T18:00:00.000Z | INFO | BE | - | run=run-1 | doc.version.save - ok | fileId8=abcd1234 version=2",
      "2026-06-19T18:00:01.000Z | WARN | FE | - | run=run-2 | ui.prompt.open - shown | fileId8=ffff0000",
    ];

    expect(
      filterDebugLogLines(lines, {
        event: "doc.version.*",
        fields: { run: "run-1", fileId8: "abcd1234" },
      }),
    ).toHaveLength(1);
  });

  it("parses quoted key value pairs", () => {
    expect(parseKeyValuePairs('message="hello world" ok=true n=3')).toEqual({
      message: "hello world",
      ok: true,
      n: 3,
    });
  });
});
