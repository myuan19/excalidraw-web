import type {
  ApiTransport,
  ApiTransportRequest,
  ApiTransportResponse,
  CatalogChangePayload,
} from "./apiTransportTypes";

function getDesktopApi() {
  return typeof window !== "undefined" ? window.editorHubDesktop : undefined;
}

export const desktopApiTransport: ApiTransport = {
  async request(request: ApiTransportRequest): Promise<ApiTransportResponse> {
    const invokeApi = getDesktopApi()?.invokeApi;
    if (!invokeApi) {
      throw new Error("editorHubDesktop.invokeApi is not available");
    }
    const path = request.path.trim();
    if (!path.startsWith("/api/")) {
      throw new Error(`Desktop API path must start with /api/: ${path}`);
    }
    return invokeApi({
      method: request.method ?? "GET",
      path,
      headers: request.headers ?? {},
      body: request.body ?? null,
    });
  },

  subscribeCatalogChanges(onChange: (payload?: CatalogChangePayload) => void) {
    const subscribe = getDesktopApi()?.subscribeCatalogChanges;
    if (!subscribe) {
      return () => {};
    }
    return subscribe((payload) => {
      onChange(payload);
    });
  },
};
