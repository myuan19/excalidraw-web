import { describe, expect, it } from "vitest";

import { formatDebugEvent, Logger } from "./core.js";

describe("logger core debug event format", () => {
  it("emits fixed-column events with sanitized context and fields", () => {
    const entries = [];
    const logger = new Logger({
      module: "save",
      source: "server",
      context: { run: "run-1" },
      transports: [{ write: (entry) => entries.push(entry) }],
    });

    logger.event("info", "doc.version.save", "saved", {
      context: { trace: "trace-1" },
      fields: {
        fileId8: "abcd1234",
        apiToken: "secret",
        nested: { value: "ok" },
      },
      sourceLocation: "ServerSync.ts:10",
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      component: "BE",
      event: "doc.version.save",
      context: { run: "run-1", trace: "trace-1" },
      fields: { fileId8: "abcd1234", apiToken: "[redacted]" },
    });
    expect(formatDebugEvent(entries[0])).toContain(
      " | INFO | BE | ServerSync.ts:10 | run=run-1 trace=trace-1 | doc.version.save - saved | ",
    );
    expect(formatDebugEvent(entries[0])).toContain('apiToken="[redacted]"');
  });

  it("keeps legacy logger calls queryable under module log events", () => {
    const entries = [];
    const logger = new Logger({
      module: "http",
      source: "server",
      transports: [{ write: (entry) => entries.push(entry) }],
    });

    logger.info("request completed", { status: 200 });

    expect(entries[0]).toMatchObject({
      event: "http.log",
      fields: { status: 200 },
    });
    expect(formatDebugEvent(entries[0])).toContain(
      " | http.log - request completed | status=200",
    );
  });
});
