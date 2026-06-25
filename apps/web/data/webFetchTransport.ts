import type {
  ApiTransport,
  ApiTransportRequest,
  ApiTransportResponse,
  CatalogChangePayload,
} from "./apiTransportTypes";

function normalizeApiPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    throw new Error("API path is required");
  }
  if (trimmed.startsWith("/api/")) {
    return trimmed;
  }
  if (trimmed.startsWith("/")) {
    return `/api${trimmed}`;
  }
  return `/api/${trimmed}`;
}

function headerRecord(headers?: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

export const webFetchTransport: ApiTransport = {
  async request(request: ApiTransportRequest): Promise<ApiTransportResponse> {
    const method = request.method ?? "GET";
    const url = normalizeApiPath(request.path);
    const response = await fetch(url, {
      method,
      headers: request.headers,
      body:
        request.body === undefined || request.body === null
          ? undefined
          : request.body,
    });
    return {
      status: response.status,
      headers: headerRecord(response.headers),
      bodyText: await response.text(),
    };
  },

  subscribeCatalogChanges(onChange: (payload?: CatalogChangePayload) => void) {
    if (typeof EventSource === "undefined") {
      return () => {};
    }
    const source = new EventSource("/api/files/watch-events");
    const listener = () => {
      onChange();
    };
    source.addEventListener("change", listener);
    source.onerror = () => {
      // EventSource auto-reconnects; callers debounce refresh.
    };
    return () => {
      source.close();
    };
  },
};
