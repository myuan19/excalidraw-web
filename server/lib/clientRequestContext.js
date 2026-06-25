import { truncStr } from "../logger.js";

function bodyDebug(req) {
  return req.body && typeof req.body.clientDebug === "object"
    ? req.body.clientDebug
    : null;
}

function headerString(req, name, maxLength) {
  const value = req.headers[name.toLowerCase()];
  return typeof value === "string" && value ? truncStr(value, maxLength) : null;
}

function bodyString(debug, name, maxLength) {
  const value = debug?.[name];
  return typeof value === "string" && value ? truncStr(value, maxLength) : null;
}

export function clientRequestContext(req) {
  const debug = bodyDebug(req);
  const bodyContentHash = debug?.contentHash;
  const bodySessionVersion = debug?.sessionVersion;
  const bodyExpectedVersion = debug?.expectedVersion;
  return {
    runId: headerString(req, "x-editorhub-run-id", 80),
    caseId: headerString(req, "x-editorhub-case-id", 80),
    traceId: headerString(req, "x-editorhub-trace-id", 80),
    requestId: headerString(req, "x-editorhub-request-id", 80),
    clientTabId:
      headerString(req, "x-editorhub-tab-id", 80) ??
      bodyString(debug, "tabId", 80),
    clientRequestSeq: headerString(req, "x-editorhub-request-seq", 24),
    clientSource:
      headerString(req, "x-editorhub-source", 80) ??
      bodyString(debug, "source", 80),
    clientTime:
      headerString(req, "x-editorhub-client-time", 80) ??
      bodyString(debug, "clientTime", 80),
    clientContentHash8:
      typeof bodyContentHash === "string" && bodyContentHash
        ? truncStr(bodyContentHash.slice(0, 8), 8)
        : null,
    clientSessionVersion:
      typeof bodySessionVersion === "number" ? bodySessionVersion : null,
    clientExpectedVersion:
      typeof bodyExpectedVersion === "number" ? bodyExpectedVersion : null,
  };
}

export function loggerContextFromRequest(req) {
  const context = clientRequestContext(req);
  return {
    ...(context.runId ? { run: context.runId } : {}),
    ...(context.caseId ? { case: context.caseId } : {}),
    ...(context.traceId ? { trace: context.traceId } : {}),
    ...(context.requestId ? { request: context.requestId } : {}),
    ...(context.clientTabId ? { tab: context.clientTabId } : {}),
  };
}
