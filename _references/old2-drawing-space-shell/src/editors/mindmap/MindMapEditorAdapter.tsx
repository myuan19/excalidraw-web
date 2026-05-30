import type { EditorAdapter, EditorMeta } from "@/types/editor";
import { createImperativeRootController } from "@/lib/imperativeReactRoot";
import { createPlaceholderThumbnailSvg } from "@/features/thumbnail";
import {
  createEmptyMindMapData,
  normalizeMindMapData,
  type MindMapDocumentData,
  type MindMapSaveResult,
} from "./bridge";
import { MindMapEditorHost, type MindMapHostHandle } from "./MindMapEditorHost";
import { editorDebugLog } from "@/features/logging/editorDebugLog";
import { describeMindMapView, mindMapDebugLog } from "./mindMapDebugLog";

export const MINDMAP_EDITOR_META: EditorMeta = {
  id: "mindmap",
  displayName: "MindMap",
  icon: "icon-[mdi--sitemap-outline]",
  supportedFormats: [".smm"],
  homeLabel: "脑图",
  homeTagline: "结构化思考",
  homeOrder: 1,
};

export function createMindMapEditor(): EditorAdapter {
  const reactRoot = createImperativeRootController();
  let container: HTMLElement | null = null;
  let handle: MindMapHostHandle | null = null;
  let data: MindMapDocumentData = createEmptyMindMapData();
  let activeFileId: string | null = null;
  let lastThumbnail: string | null = null;
  let changeHandler: ((data: unknown) => void) | null = null;

  function render() {
    if (!container) return;
    mindMapDebugLog("adapter.render", {
      fileId: activeFileId,
      hasRoot: !!reactRoot.getRoot(),
      view: describeMindMapView(data.view),
    });
    reactRoot.render(container, (root) => root.render(
      <MindMapEditorHost
        fileId={activeFileId}
        initialData={data}
        onReady={(nextHandle) => {
          handle = nextHandle;
          handle.setData(data);
        }}
        onChange={(result: MindMapSaveResult) => {
          data = result.data;
          lastThumbnail = result.thumbnail ?? lastThumbnail;
          changeHandler?.({
            kind: "mindmap",
            containerVersion: 1,
            formatVersion: 1,
            data,
          });
        }}
      />,
    ));
  }

  async function requestLatestData() {
    if (!handle) return { data, thumbnail: lastThumbnail };
    try {
      const result = await handle.requestSave();
      data = result.data;
      lastThumbnail = result.thumbnail ?? lastThumbnail;
    } catch {
      // Native save is best effort; keep the last bridge payload.
    }
    return { data, thumbnail: lastThumbnail };
  }

  return {
    ...MINDMAP_EDITOR_META,

    mount(el: HTMLElement) {
      mindMapDebugLog("adapter.mount", { fileId: activeFileId });
      editorDebugLog("MindMapAdapter.mount", {
        fileId: activeFileId,
        tag: el.tagName,
        childCount: el.childElementCount,
      });
      if (container !== el) {
        reactRoot.destroySync();
      }
      container = el;
      render();
      editorDebugLog("MindMapAdapter.mount.afterRender", {
        fileId: activeFileId,
        childCount: el.childElementCount,
      });
    },

    unmount() {
      mindMapDebugLog("adapter.unmount", { fileId: activeFileId, hadRoot: !!reactRoot.getRoot() });
      editorDebugLog("MindMapAdapter.unmount", { fileId: activeFileId, hadRoot: !!reactRoot.getRoot() });
      reactRoot.destroy();
      handle = null;
      container = null;
      changeHandler = null;
    },

    unmountSync() {
      reactRoot.destroySync();
      handle = null;
      container = null;
      changeHandler = null;
    },

    setFileContext(fileId) {
      activeFileId = fileId;
    },

    async loadData(raw: ArrayBuffer | string) {
      const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
      editorDebugLog("MindMapAdapter.loadData.start", {
        fileId: activeFileId,
        textLength: text.length,
        hasHandle: !!handle,
        hasContainer: !!container,
      });
      try {
        data = normalizeMindMapData(JSON.parse(text || "{}"));
        mindMapDebugLog("adapter.loadData", {
          fileId: activeFileId,
          view: describeMindMapView(data.view),
        });
        if (handle) handle.setData(data);
        else render();
        editorDebugLog("MindMapAdapter.loadData.done", { fileId: activeFileId });
      } catch (error) {
        editorDebugLog("MindMapAdapter.loadData.error", {
          fileId: activeFileId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw error;
      }
    },

    async saveData() {
      const latest = await requestLatestData();
      return {
        data: new Blob([JSON.stringify({
          kind: "mindmap",
          containerVersion: 1,
          formatVersion: 1,
          data: latest.data,
        })], { type: "application/json" }),
        format: ".smm",
      };
    },

    async getThumbnail() {
      const latest = await requestLatestData();
      const svg = latest.thumbnail && latest.thumbnail.includes("<svg")
        ? latest.thumbnail
        : createPlaceholderThumbnailSvg({ title: "MindMap", kind: "mindmap" });
      return new Blob([svg], { type: "image/svg+xml" });
    },

    onDidChange(handler) {
      changeHandler = handler;
      return () => {
        if (changeHandler === handler) {
          changeHandler = null;
        }
      };
    },
  };
}
