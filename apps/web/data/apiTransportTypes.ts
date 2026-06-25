export type ApiTransportRequest = {
  method?: string;
  path: string;
  headers?: Record<string, string>;
  body?: string | null;
};

export type ApiTransportResponse = {
  status: number;
  headers: Record<string, string>;
  bodyText: string;
};

export type CatalogChangePayload = Record<string, unknown>;

export type ApiTransport = {
  request: (request: ApiTransportRequest) => Promise<ApiTransportResponse>;
  subscribeCatalogChanges: (
    onChange: (payload?: CatalogChangePayload) => void,
  ) => () => void;
};
