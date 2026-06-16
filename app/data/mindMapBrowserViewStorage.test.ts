import {
  applyMindMapBrowserView,
  moveMindMapBrowserViewBetweenFiles,
  readMindMapBrowserView,
  saveMindMapBrowserView,
  saveMindMapBrowserViewFromData,
} from "./mindMapBrowserViewStorage";

describe("mindMapBrowserViewStorage", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("stores MindMap viewport state locally per file", () => {
    const view = {
      transform: { scaleX: 1, scaleY: 1, translateX: 120, translateY: -40 },
      state: { scale: 1, x: 120, y: -40, sx: 0, sy: 0 },
    };

    saveMindMapBrowserView("file-a", view);

    expect(readMindMapBrowserView("file-a")).toEqual(view);
    expect(readMindMapBrowserView("file-b")).toBe(null);
  });

  it("injects local viewport state into native payloads without mutating document data", () => {
    const data = {
      root: { data: { text: "root" }, children: [] },
      layout: "logicalStructure",
    };
    const view = {
      transform: { scaleX: 1, scaleY: 1, translateX: 16, translateY: 24 },
      state: { scale: 1, x: 16, y: 24, sx: 0, sy: 0 },
    };

    saveMindMapBrowserView("file-a", view);

    expect(applyMindMapBrowserView(data, "file-a")).toEqual({
      ...data,
      view,
    });
    expect(data).not.toHaveProperty("view");
  });

  it("extracts viewport state from raw plain and managed MindMap data", () => {
    const plainView = {
      transform: { scaleX: 1, scaleY: 1, translateX: 10, translateY: 20 },
      state: { scale: 1, x: 10, y: 20 },
    };
    const managedView = {
      transform: { scaleX: 1, scaleY: 1, translateX: -4, translateY: 32 },
      state: { scale: 1, x: -4, y: 32 },
    };

    saveMindMapBrowserViewFromData("plain", {
      root: { data: { text: "root" }, children: [] },
      view: plainView,
    });
    saveMindMapBrowserViewFromData("managed", {
      kind: "mindmap",
      data: {
        root: { data: { text: "root" }, children: [] },
        view: managedView,
      },
    });

    expect(readMindMapBrowserView("plain")).toEqual(plainView);
    expect(readMindMapBrowserView("managed")).toEqual(managedView);
  });

  it("moves valid viewport state between file ids", () => {
    const view = {
      transform: { scaleX: 1.2, scaleY: 1.2, translateX: 42, translateY: -8 },
      state: { scale: 1.2, x: 42, y: -8, sx: 0, sy: 0 },
    };

    saveMindMapBrowserView("local-draft:a", view);
    moveMindMapBrowserViewBetweenFiles("local-draft:a", "server-file");

    expect(readMindMapBrowserView("local-draft:a")).toBe(null);
    expect(readMindMapBrowserView("server-file")).toEqual(view);
  });

  it("does not migrate invalid viewport payloads", () => {
    window.localStorage.setItem(
      "mindmap-browser-view-v1-local-draft:a",
      JSON.stringify({ v: 1, view: { transform: {}, state: null } }),
    );

    moveMindMapBrowserViewBetweenFiles("local-draft:a", "server-file");

    expect(readMindMapBrowserView("server-file")).toBe(null);
  });
});
