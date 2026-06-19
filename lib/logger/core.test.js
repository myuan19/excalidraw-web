import { describe, expect, it } from "vitest";

import {
  Logger,
  formatDebugEvent,
  formatKeyValuePairs,
  sanitizeLogRecord,
} from "./core.js";

function createMemoryTransport() {
  const entries = [];
  return {
    entries,
    transport: {
      write(entry) {
        entries.push(entry);
      },
    },
  };
}

describe("logger core debug event protocol", () => {
  it("keeps legacy message/data calls compatible while adding protocol fields", () => {
    const memory = createMemoryTransport();
    const log = new Logger({
      module: "saveQueue",
      source: "client",
      minLevel: "debug",
      transports: [memory.transport],
    });

    log.info("request queued", { fileId8: "66a58376", source: "auto" });

    expect(memory.entries).toHaveLength(1);
    expect(memory.entries[0]).toMatchObject({
      level: "info",
      source: "client",
      component: "FE",
      module: "saveQueue",
      event: "saveQueue.log",
      msg: "request queued",
      data: { fileId8: "66a58376", source: "auto" },
      fields: { fileId8: "66a58376", source: "auto" },
    });
    expect(memory.entries[0].sequence).toEqual(expect.any(Number));
  });

  it("emits stable debug events with context and fields", () => {
    const memory = createMemoryTransport();
    const log = new Logger({
      module: "sync",
      source: "client",
      context: { run: "RUN1", trace: "TRACE1" },
      minLevel: "trace",
      transports: [memory.transport],
    });

    log.event("debug", "sync.remote.apply", "Remote scene applied", {
      context: { request: "REQ1" },
      fields: { fileId8: "66a58376", version: 105, dirty: false },
      sourceLocation: "app/data/ServerSync.ts:getFile:470",
    });

    expect(memory.entries[0]).toMatchObject({
      event: "sync.remote.apply",
      msg: "Remote scene applied",
      context: { run: "RUN1", trace: "TRACE1", request: "REQ1" },
      fields: { fileId8: "66a58376", version: 105, dirty: false },
      sourceLocation: "app/data/ServerSync.ts:getFile:470",
    });
  });

  it("resolves logger context dynamically for each entry", () => {
    const memory = createMemoryTransport();
    let trace = "TRACE1";
    const log = new Logger({
      module: "sync",
      source: "client",
      context: () => ({ trace }),
      minLevel: "debug",
      transports: [memory.transport],
    });

    log.info("first");
    trace = "TRACE2";
    log.info("second");

    expect(memory.entries[0].context).toMatchObject({ trace: "TRACE1" });
    expect(memory.entries[1].context).toMatchObject({ trace: "TRACE2" });
  });

  it("formats fixed-column debug events for files and query tools", () => {
    const line = formatDebugEvent({
      ts: "2026-06-18T21:00:00.000+08:00",
      level: "warn",
      source: "server",
      component: "BE",
      module: "files",
      event: "file.save.conflict",
      msg: "Version conflict",
      context: { request: "REQ1", trace: "TRACE1" },
      fields: { expectedVersion: 100, serverVersion: 101, reason: "auto save" },
      sourceLocation: "server/routes/files.js:putFile:966",
    });

    expect(line).toBe(
      '2026-06-18T21:00:00.000+08:00 | WARN | BE | server/routes/files.js:putFile:966 | request=REQ1 trace=TRACE1 | file.save.conflict - Version conflict | expectedVersion=100 reason="auto save" serverVersion=101',
    );
  });

  it("formats field values predictably", () => {
    expect(
      formatKeyValuePairs({
        bool: true,
        empty: "",
        safe: "abc-123",
        spaced: "hello world",
      }),
    ).toBe('bool=true empty="" safe=abc-123 spaced="hello world"');
  });

  it("preserves client session id in formatted fields", () => {
    expect(
      formatDebugEvent({
        ts: "2026-06-18T21:00:00.000+08:00",
        level: "info",
        source: "client",
        module: "ingest",
        event: "client.console",
        msg: "console forwarded",
        sid: "SID1",
      }),
    ).toContain("| sid=SID1");
  });

  it("redacts sensitive fields and truncates large values", () => {
    const longValue = "x".repeat(2100);

    expect(
      sanitizeLogRecord({
        apiKey: "secret-key",
        authorization: "Bearer token",
        normal: longValue,
        nested: {
          password: "secret-password",
          safe: "value",
        },
      }),
    ).toMatchObject({
      apiKey: "[redacted]",
      authorization: "[redacted]",
      normal: expect.stringContaining("[truncated:"),
      nested: {
        password: "[redacted]",
        safe: "value",
      },
    });
  });

  it("sanitizes emitted entries before transports receive them", () => {
    const memory = createMemoryTransport();
    const log = new Logger({
      module: "security",
      source: "server",
      minLevel: "debug",
      transports: [memory.transport],
    });

    log.event("debug", "security.test", "test", {
      fields: {
        token: "abc",
        fileId8: "66a58376",
      },
    });

    expect(memory.entries[0].fields).toMatchObject({
      token: "[redacted]",
      fileId8: "66a58376",
    });
    expect(formatDebugEvent(memory.entries[0])).toContain('token="[redacted]"');
  });
});
