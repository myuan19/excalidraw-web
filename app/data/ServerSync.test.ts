import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./debugCapability", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./debugCapability")>();
  return {
    ...actual,
    isDebugAllowed: () => true,
    isDebugRuntimeEnabled: () => true,
  };
});

import {
  clearDocumentSessionVersion,
  setDocumentSessionVersion,
} from "./documentSessionVersion";
import { FileSyncState } from "./FileSyncState";
import { ServerSync } from "./ServerSync";

const FILE_ID = "server-sync-save-lock";

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
      {
        source: "auto",
      },
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
    expect(first.init?.cache).toBe("no-store");
    const headers = first.init?.headers;
    expect(getHeader(headers, "If-None-Match")).toBeUndefined();
    expect(getHeader(headers, "Cache-Control")).toBe("no-cache");
    expect(getHeader(headers, "X-EditorHub-Source")).toBe("getFile-force");
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

    expect(requests).toHaveLength(2);
    expect(String(requests[1].input)).toContain(`/files/${FILE_ID}?refetch=`);
    expect(requests[1].init?.cache).toBe("no-store");
    expect(file.version).toBe(8);
    expect(
      (file.data as { elements: Array<{ id: string }> }).elements[0].id,
    ).toBe("new-element");
  });
});
