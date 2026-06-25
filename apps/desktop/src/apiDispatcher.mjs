import http from "node:http";

/**
 * In-process Express dispatch for Desktop IPC.
 * Uses a loopback-only server per app instance (no fixed port like 3033).
 */

const loopbackServers = new WeakMap();

function normalizeHeaderRecord(headers = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || value === null) {
      continue;
    }
    normalized[key.toLowerCase()] = Array.isArray(value)
      ? value.map(String).join(", ")
      : String(value);
  }
  return normalized;
}

function normalizeApiPath(path) {
  const trimmed = String(path ?? "").trim();
  if (!trimmed) {
    throw new Error("dispatchExpressRequest requires a non-empty path");
  }
  if (!trimmed.startsWith("/")) {
    return `/${trimmed}`;
  }
  return trimmed;
}

export async function ensureLoopbackServer(app) {
  const cached = loopbackServers.get(app);
  if (cached) {
    return cached;
  }

  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
    server.once("error", reject);
  });

  const address = server.address();
  const port =
    address && typeof address === "object" ? address.port : undefined;
  if (!port) {
    throw new Error("Failed to bind loopback dispatch server");
  }

  const entry = {
    server,
    port,
    close() {
      loopbackServers.delete(app);
      return new Promise((resolve) => {
        server.close(() => resolve());
      });
    },
  };
  loopbackServers.set(app, entry);
  return entry;
}

/**
 * @param {import("express").Application} app
 * @param {{
 *   method?: string;
 *   path: string;
 *   headers?: Record<string, string | string[] | undefined>;
 *   body?: string | null;
 * }} options
 */
export async function dispatchExpressRequest(app, options) {
  const method = String(options.method ?? "GET").toUpperCase();
  const path = normalizeApiPath(options.path);
  const headers = normalizeHeaderRecord(options.headers);
  const bodyText =
    options.body === undefined || options.body === null
      ? null
      : String(options.body);

  if (bodyText && !headers["content-type"]) {
    headers["content-type"] = "application/json";
  }

  const { port } = await ensureLoopbackServer(app);
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body: bodyText ?? undefined,
  });
  const responseText = await response.text();
  const responseHeaders = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  return {
    status: response.status,
    headers: responseHeaders,
    bodyText: responseText,
  };
}

export async function closeDispatchLoopbackServer(app) {
  const cached = loopbackServers.get(app);
  if (!cached) {
    return;
  }
  await cached.close();
}
