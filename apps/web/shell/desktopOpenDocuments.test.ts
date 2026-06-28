import { afterEach, describe, expect, it, vi } from "vitest";

import { bindDesktopOpenDocumentPaths } from "./desktopOpenDocuments";

describe("bindDesktopOpenDocumentPaths", () => {
  afterEach(() => {
    delete window.editorHubDesktop;
  });

  it("subscribes before consuming queued startup paths", () => {
    const order: string[] = [];
    const handler = vi.fn();
    const subscribeOpenDocumentPaths = vi.fn((callback) => {
      order.push("subscribe");
      callback(["C:/docs/a.excalidraw"]);
      return () => {};
    });
    const consumeOpenDocumentPaths = vi.fn(async () => {
      order.push("consume");
      return ["C:/docs/b.smm"];
    });

    window.editorHubDesktop = {
      subscribeOpenDocumentPaths,
      consumeOpenDocumentPaths,
    };

    bindDesktopOpenDocumentPaths(handler);

    expect(order).toEqual(["subscribe", "consume"]);
    expect(subscribeOpenDocumentPaths).toHaveBeenCalledOnce();
    expect(consumeOpenDocumentPaths).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(["C:/docs/a.excalidraw"]);
  });

  it("delivers consumed startup paths to the handler", async () => {
    const handler = vi.fn();
    window.editorHubDesktop = {
      subscribeOpenDocumentPaths: () => () => {},
      consumeOpenDocumentPaths: async () => ["C:/docs/startup.excalidraw"],
    };

    bindDesktopOpenDocumentPaths(handler);
    await Promise.resolve();

    expect(handler).toHaveBeenCalledWith(["C:/docs/startup.excalidraw"]);
  });

  it("no-ops when desktop bridge is unavailable", () => {
    const handler = vi.fn();
    const unsubscribe = bindDesktopOpenDocumentPaths(handler);
    expect(unsubscribe).toBeTypeOf("function");
    expect(handler).not.toHaveBeenCalled();
  });
});
