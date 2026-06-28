import { beforeEach, describe, expect, it, vi } from "vitest";

import { broadcastFileSaved } from "./crossTabFileSync";
import {
  clearDocumentSessionVersion,
  setDocumentSessionVersion,
} from "./documentSessionVersion";
import { FileSyncState } from "./FileSyncState";
import {
  isServerSyncNotFoundError,
  isServerSyncVersionConflictError,
  ServerSync,
  ServerSyncError,
} from "./ServerSync";

vi.mock("./crossTabFileSync", () => ({
  broadcastFileSaved: vi.fn(),
}));

vi.mock("./debugCapability", () => ({
  isDebugAllowed: () => true,
  isDebugRuntimeEnabled: () => true,
}));

const FILE_ID = "server-sync-save-lock";
const broadcastFileSavedMock = vi.mocked(broadcastFileSaved);

function getHeader(
  headers: HeadersInit | undefined,
  name: string,
): string | undefined {
  if (!headers) {
    return undefined;
  }
  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }
  if (Array.isArray(headers)) {
    return headers.find(
      ([key]) => key.toLowerCase() === name.toLowerCase(),
    )?.[1];
  }
  return headers[name];
}

describe("ServerSync.saveFileImmediate", () => {
  beforeEach(() => {
    clearDocumentSessionVersion(FILE_ID, "test-reset");
    FileSyncState.clearLocalCache(FILE_ID);
    FileSyncState.clearHashStateForFile(FILE_ID);
    vi.restoreAllMocks();
    broadcastFileSavedMock.mockClear();
  });

  it("serializes same-file saves so the second request uses the updated version", async () => {
    setDocumentSessionVersion(FILE_ID, 1, { reason: "test-start" });

    let releaseFirstFetch!: () => void;
    const firstFetchGate = new Promise<void>((resolve) => {
      releaseFirstFetch = resolve;
    });
    const expectedVersions: Array<number | undefined> = [];
    const requestHeaders: HeadersInit[] = [];

    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestHeaders.push(init?.headers ?? {});
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          expectedVersion?: number;
        };
        expectedVersions.push(body.expectedVersion);

        if (expectedVersions.length === 1) {
          await firstFetchGate;
        }

        const version = expectedVersions.length + 1;
        return new Response(
          JSON.stringify({
            ok: true,
            content_sha256: `sha-${version}`,
            version,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      },
    );

    const first = ServerSync.saveFileImmediate(
      FILE_ID,
      { elements: [] },
      undefined,
      undefined,
      { source: "auto" },
    );
    await vi.waitFor(() => expect(expectedVersions).toEqual([1]));

    const second = ServerSync.saveFileImmediate(
      FILE_ID,
      { elements: [] },
      undefined,
      undefined,
      { source: "toolbar" },
    );
    await Promise.resolve();
    expect(expectedVersions).toEqual([1]);

    releaseFirstFetch();
    await Promise.all([first, second]);

    expect(expectedVersions).toEqual([1, 2]);
    expect(getHeader(requestHeaders[0], "X-EditorHub-Tab-Id")).toMatch(/^tab-/);
    expect(getHeader(requestHeaders[0], "X-EditorHub-Source")).toBe("auto");
    expect(getHeader(requestHeaders[1], "X-EditorHub-Source")).toBe("toolbar");
  });

  it("broadcasts successful content saves with server version metadata", async () => {
    setDocumentSessionVersion(FILE_ID, 1, { reason: "test-start" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          content_sha256: "sha-broadcast",
          version: 2,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    await ServerSync.saveFileImmediate(
      FILE_ID,
      { elements: [{ id: "one" }] },
      undefined,
      undefined,
      { source: "toolbar" },
    );

    expect(broadcastFileSavedMock).toHaveBeenCalledWith(FILE_ID, {
      contentSha256: "sha-broadcast",
      version: 2,
    });
  });

  it("omits stale If-Match when force overwriting a version conflict", async () => {
    setDocumentSessionVersion(FILE_ID, 3, { reason: "test-start" });
    FileSyncState.setServerHash(FILE_ID, "stale-server-sha");
    let requestHeaders: HeadersInit | undefined;
    let requestBody: { forceOverwrite?: boolean; expectedVersion?: number } =
      {};
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestHeaders = init?.headers;
        requestBody = JSON.parse(String(init?.body ?? "{}"));
        return new Response(
          JSON.stringify({
            ok: true,
            content_sha256: "sha-force-overwrite",
            version: 4,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      },
    );

    await ServerSync.saveFileImmediate(
      FILE_ID,
      { elements: [{ id: "local" }] },
      undefined,
      undefined,
      { forceOverwrite: true, source: "toolbar" },
    );

    expect(getHeader(requestHeaders, "If-Match")).toBeUndefined();
    expect(requestBody).toMatchObject({
      expectedVersion: 3,
      forceOverwrite: true,
    });
  });

  it("does not broadcast skipped or suppressed saves", async () => {
    setDocumentSessionVersion(FILE_ID, 1, { reason: "test-start" });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            skipped: true,
            content_sha256: "sha-skipped",
            version: 1,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            content_sha256: "sha-suppressed",
            version: 2,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );

    await ServerSync.saveFileImmediate(
      FILE_ID,
      { elements: [{ id: "skipped" }] },
      undefined,
      undefined,
      { source: "auto" },
    );
    await ServerSync.saveFileImmediate(
      FILE_ID,
      { elements: [{ id: "suppressed" }] },
      undefined,
      undefined,
      { source: "toolbar", suppressSavedEvent: true },
    );

    expect(broadcastFileSavedMock).not.toHaveBeenCalled();
  });

  it("force-loads files without conditional browser cache", async () => {
    FileSyncState.setServerHash(FILE_ID, "server-sha");
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> =
      [];

    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({ input, init });
        return new Response(
          JSON.stringify({
            id: FILE_ID,
            name: "Server file",
            data: { elements: [] },
            content_sha256: "remote-sha",
            version: 10,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      },
    );

    await ServerSync.getFile(FILE_ID, { force: true });

    const first = requests[0];
    expect(String(first.input)).toContain(`/files/${FILE_ID}?force=`);
    expect(getHeader(first.init?.headers, "Cache-Control")).toBe("no-cache");
    expect(getHeader(first.init?.headers, "If-None-Match")).toBeUndefined();
    expect(getHeader(first.init?.headers, "X-EditorHub-Source")).toBe(
      "getFile-force",
    );
  });

  it("does not use local cache when a force-load receives 304", async () => {
    FileSyncState.setServerHash(FILE_ID, "server-sha");
    const statuses: number[] = [];

    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        statuses.push(statuses.length === 0 ? 304 : 200);
        if (statuses.length === 1) {
          return new Response(null, { status: 304 });
        }
        expect(getHeader(init?.headers, "X-EditorHub-Source")).toBe(
          "getFile-force-retry",
        );
        return new Response(
          JSON.stringify({
            id: FILE_ID,
            name: "Server file",
            data: { elements: [] },
            content_sha256: "remote-sha",
            version: 11,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      },
    );

    const file = await ServerSync.getFile(FILE_ID, { force: true });

    expect(statuses).toEqual([304, 200]);
    expect(file.version).toBe(11);
  });

  it("refetches after 304 when local cache metadata does not match the requested server hash", async () => {
    FileSyncState.setLocalCache(FILE_ID, {
      elements: [{ id: "old-element" }],
      appState: {},
      files: {},
      deltas: [],
      meta: {
        serverContentSha256: "old-server-sha",
        serverVersion: 4,
      },
    });
    FileSyncState.setServerHash(FILE_ID, "new-server-sha");
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> =
      [];

    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({ input, init });
        if (requests.length === 1) {
          return new Response(null, { status: 304 });
        }
        return new Response(
          JSON.stringify({
            id: FILE_ID,
            name: "Server file",
            data: { elements: [{ id: "new-element" }] },
            content_sha256: "new-server-sha",
            version: 8,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      },
    );

    const file = await ServerSync.getFile(FILE_ID);

    const fileRequests = requests.filter((request) =>
      String(request.input).includes(`/files/${FILE_ID}`),
    );
    expect(fileRequests).toHaveLength(2);
    expect(String(fileRequests[1].input)).toContain(
      `/files/${FILE_ID}?refetch=`,
    );
    expect(getHeader(fileRequests[1].init?.headers, "Cache-Control")).toBe(
      "no-cache",
    );
    expect(file.version).toBe(8);
    expect(
      (file.data as { elements: Array<{ id: string }> }).elements[0].id,
    ).toBe("new-element");
  });
});

describe("ServerSync errors", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("classifies getFile 404 responses as not found errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    );

    let caught: unknown = null;
    try {
      await ServerSync.getFile(FILE_ID, { force: true });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ServerSyncError);
    expect(isServerSyncNotFoundError(caught)).toBe(true);
  });
});

describe("ServerSync.listFileTree", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts apiTransport 200 responses without res.ok", async () => {
    const { apiTransport } = await import("./apiTransport");
    vi.spyOn(apiTransport, "request").mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/json", etag: "tree-etag-1" },
      bodyText: JSON.stringify({ folders: [], files: [] }),
    });

    const tree = await ServerSync.listFileTree();
    expect(tree).toEqual({ folders: [], files: [] });
  });

  it("coalesces concurrent listFileTree calls into one transport request", async () => {
    const { apiTransport } = await import("./apiTransport");
    const request = vi.spyOn(apiTransport, "request").mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/json", etag: "tree-etag-2" },
      bodyText: JSON.stringify({ folders: [], files: [] }),
    });

    const [a, b] = await Promise.all([
      ServerSync.listFileTree(),
      ServerSync.listFileTree(),
    ]);
    expect(a).toEqual({ folders: [], files: [] });
    expect(b).toEqual({ folders: [], files: [] });
    expect(request).toHaveBeenCalledOnce();
  });

  it("reads local-draft ids from browser cache without calling the server", async () => {
    const draftId = `local-draft:${crypto.randomUUID()}`;
    const { LocalDraftSessions } = await import("./localDraftSessions");
    LocalDraftSessions.upsert({
      id: draftId,
      name: "草稿",
      kind: "mindmap",
      created_at: "2026-06-25T00:00:00.000Z",
      updated_at: "2026-06-25T00:00:00.000Z",
    });
    FileSyncState.setLocalCache(draftId, {
      document: {
        kind: "mindmap",
        containerVersion: 1,
        formatVersion: 1,
        data: {
          name: "草稿",
          root: { data: { text: "Root" }, children: [] },
          layout: "logicalStructure",
        },
      },
      deltas: [],
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const file = await ServerSync.getFile(draftId, { force: true });
    expect(file.id).toBe(draftId);
    expect(file.kind).toBe("mindmap");
    expect(fetchSpy).not.toHaveBeenCalled();

    LocalDraftSessions.remove(draftId);
    FileSyncState.clearLocalCache(draftId);
  });
});

describe("isServerSyncVersionConflictError", () => {
  it("matches version_conflict 409 only", () => {
    expect(
      isServerSyncVersionConflictError(
        new ServerSyncError(
          "conflict",
          409,
          "/files/a",
          JSON.stringify({ error: "version_conflict", version: 2 }),
        ),
      ),
    ).toBe(true);
    expect(
      isServerSyncVersionConflictError(
        new ServerSyncError(
          "stale",
          409,
          "/files/a/thumbnail",
          JSON.stringify({ error: "stale_thumbnail" }),
        ),
      ),
    ).toBe(false);
  });
});

describe("ServerSync.saveFileImmediate session preflight", () => {
  beforeEach(() => {
    clearDocumentSessionVersion(FILE_ID, "test-reset");
    FileSyncState.clearLocalCache(FILE_ID);
    FileSyncState.clearHashStateForFile(FILE_ID);
    vi.restoreAllMocks();
  });

  it("falls back to cache meta version before save when session is empty", async () => {
    FileSyncState.setLocalCache(FILE_ID, {
      elements: [],
      appState: {},
      files: {},
      deltas: [],
      meta: { serverContentSha256: "server-sha", serverVersion: 6 },
    });
    FileSyncState.setServerHash(FILE_ID, "server-sha");
    FileSyncState.alignHashes(FILE_ID, "baseline-hash");
    FileSyncState.setDraftHash(FILE_ID, "draft-hash");

    vi.spyOn(ServerSync, "listFileHashes").mockRejectedValue(
      new Error("offline"),
    );

    let requestBody: { expectedVersion?: number } = {};
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body ?? "{}"));
        return new Response(
          JSON.stringify({
            ok: true,
            content_sha256: "sha-7",
            version: 7,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      },
    );

    await ServerSync.saveFileImmediate(
      FILE_ID,
      { elements: [{ id: "local" }] },
      undefined,
      undefined,
      { source: "auto" },
    );

    expect(requestBody.expectedVersion).toBe(6);
  });
});
