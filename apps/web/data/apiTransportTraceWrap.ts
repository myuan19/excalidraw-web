import {
  isResourceTraceEnabled,
  traceApiCall,
  traceCatalogChangeScheduled,
} from "../lib/resourceTrace";

import type {
  ApiTransport,
  ApiTransportRequest,
  CatalogChangePayload,
} from "./apiTransportTypes";

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function traceCatalogChange(payload?: CatalogChangePayload): void {
  if (!isResourceTraceEnabled()) {
    return;
  }
  traceCatalogChangeScheduled();
  const prefix = `[DEBUG] user-trace | resource | catalog-change`;
  try {
    console.warn(prefix, {
      reason: payload?.reason ?? null,
      fileId8:
        typeof payload?.fileId === "string" ? payload.fileId.slice(0, 8) : null,
      resourceTrace: true,
    });
  } catch {
    console.warn(prefix);
  }
}

/** 与 apiTransport 分文件，避免 apiTransport ↔ resourceTrace ↔ logger 静态循环依赖。 */
export function wrapApiTransportWithResourceTrace(
  transport: ApiTransport,
): ApiTransport {
  return {
    async request(request: ApiTransportRequest) {
      const t0 = nowMs();
      const response = await transport.request(request);
      traceApiCall(
        request.method ?? "GET",
        request.path,
        response.status,
        Math.round(nowMs() - t0),
        {
          bodyLen:
            request.body === null || request.body === undefined
              ? 0
              : String(request.body).length,
        },
      );
      return response;
    },
    subscribeCatalogChanges(onChange: (payload?: CatalogChangePayload) => void) {
      const unsubscribe = transport.subscribeCatalogChanges((payload) => {
        traceCatalogChange(payload);
        onChange(payload);
      });
      return unsubscribe ?? (() => {});
    },
  };
}
