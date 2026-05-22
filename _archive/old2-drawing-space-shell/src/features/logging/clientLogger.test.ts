import { describe, expect, it, vi } from "vitest";
import { installClientLogger, postClientLog } from "./clientLogger";

describe("clientLogger", () => {
  it("posts client log entries to the server ingest endpoint", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true });

    await postClientLog({ level: "error", msg: "boom", data: { code: "E_TEST" } }, fetcher);

    expect(fetcher).toHaveBeenCalledWith("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: [{ level: "error", msg: "boom", data: { code: "E_TEST" } }],
      }),
      keepalive: true,
    });
  });

  it("installs global error and unhandled rejection listeners once", () => {
    const target = new EventTarget();
    const fetcher = vi.fn().mockResolvedValue({ ok: true });

    installClientLogger({ target, fetcher });
    installClientLogger({ target, fetcher });
    target.dispatchEvent(Object.assign(new Event("error"), { message: "boom" }));

    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
