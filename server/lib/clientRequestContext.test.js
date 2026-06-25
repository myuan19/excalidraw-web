import { describe, expect, it } from "vitest";

import {
  clientRequestContext,
  loggerContextFromRequest,
} from "./clientRequestContext.js";

describe("server clientRequestContext", () => {
  it("extracts debug runtime context from headers and body fallback", () => {
    const req = {
      headers: {
        "x-editorhub-run-id": "RUN1",
        "x-editorhub-case-id": "CASE1",
        "x-editorhub-trace-id": "TRACE1",
        "x-editorhub-request-id": "REQ1",
        "x-editorhub-tab-id": "TAB1",
        "x-editorhub-request-seq": "7",
        "x-editorhub-source": "auto-save",
      },
      body: {
        clientDebug: {
          clientTime: "2026-06-18T21:00:00.000+08:00",
          contentHash: "abcdef123456",
          expectedVersion: 42,
          sessionVersion: 41,
        },
      },
    };

    expect(clientRequestContext(req)).toMatchObject({
      runId: "RUN1",
      caseId: "CASE1",
      traceId: "TRACE1",
      requestId: "REQ1",
      clientTabId: "TAB1",
      clientRequestSeq: "7",
      clientSource: "auto-save",
      clientContentHash8: "abcdef12",
      clientSessionVersion: 41,
      clientExpectedVersion: 42,
    });
    expect(loggerContextFromRequest(req)).toEqual({
      run: "RUN1",
      case: "CASE1",
      trace: "TRACE1",
      request: "REQ1",
      tab: "TAB1",
    });
  });
});
