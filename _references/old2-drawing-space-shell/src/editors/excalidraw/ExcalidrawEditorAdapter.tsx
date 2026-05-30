import { exportToSvg } from "@excalidraw/excalidraw";
import type { EditorAdapter, EditorMeta } from "@/types/editor";
import { appStateForThumbnailExport } from "@/features/thumbnail/thumbnailExport";
import { createImperativeRootController } from "@/lib/imperativeReactRoot";
import { editorDebugLog } from "@/features/logging/editorDebugLog";
import { blobToText, createExcalidrawFallbackThumbnail, normalizeExcalidrawScene } from "./save";
import { ExcalidrawEditorHost, type ExcalidrawEditorHandle } from "./ExcalidrawEditorHost";

export const EXCALIDRAW_EDITOR_META: EditorMeta = {
  id: "excalidraw",
  displayName: "Excalidraw",
  icon: "icon-[mdi--draw]",
  supportedFormats: [".excalidraw", ".json"],
  homeLabel: "白板",
  homeTagline: "手绘与协作",
  homeOrder: 0,
};

export function createExcalidrawEditor(): EditorAdapter {
  const reactRoot = createImperativeRootController();
  let container: HTMLElement | null = null;
  let api: ExcalidrawEditorHandle | null = null;
  let scene = normalizeExcalidrawScene(undefined);
  let changeHandler: ((data: unknown) => void) | null = null;

  function render() {
    if (!container) {
      editorDebugLog("ExcalidrawAdapter.render.skip", { reason: "no-container" });
      return;
    }
    editorDebugLog("ExcalidrawAdapter.render", {
      hasRoot: !!reactRoot.getRoot(),
      containerChildCount: container.childElementCount,
    });
    reactRoot.render(container, (root) => root.render(
      <ExcalidrawEditorHost
        initialData={scene}
        onReady={(nextApi) => {
          editorDebugLog("ExcalidrawAdapter.onReady", { hasApi: !!nextApi });
          api = nextApi;
          api.updateScene(scene);
        }}
        onChange={(nextScene) => {
          scene = normalizeExcalidrawScene(nextScene);
          changeHandler?.(scene);
        }}
      />,
    ));
  }

  function getCurrentScene() {
    if (!api) return scene;
    scene = normalizeExcalidrawScene({
      elements: api.getSceneElementsIncludingDeleted?.() ?? api.getSceneElements(),
      appState: api.getAppState(),
      files: api.getFiles(),
    });
    return scene;
  }

  return {
    ...EXCALIDRAW_EDITOR_META,

    mount(el: HTMLElement) {
      editorDebugLog("ExcalidrawAdapter.mount", {
        tag: el.tagName,
        childCount: el.childElementCount,
      });
      if (container !== el) {
        reactRoot.destroySync();
      }
      container = el;
      render();
    },

    unmount() {
      editorDebugLog("ExcalidrawAdapter.unmount");
      reactRoot.destroy();
      api = null;
      container = null;
      changeHandler = null;
    },

    unmountSync() {
      editorDebugLog("ExcalidrawAdapter.unmountSync");
      reactRoot.destroySync();
      api = null;
      container = null;
      changeHandler = null;
    },

    resize() {
      api?.refresh?.();
    },

    async loadData(raw: ArrayBuffer | string) {
      const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
      editorDebugLog("ExcalidrawAdapter.loadData", {
        textLength: text.length,
        hasApi: !!api,
        hasContainer: !!container,
      });
      try {
        scene = normalizeExcalidrawScene(JSON.parse(text || "{}"));
        if (api) {
          api.updateScene(scene);
        } else {
          render();
        }
        editorDebugLog("ExcalidrawAdapter.loadData.done", {
          elementCount: scene.elements?.length ?? 0,
        });
      } catch (error) {
        editorDebugLog("ExcalidrawAdapter.loadData.error", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw error;
      }
    },

    async saveData() {
      const data = JSON.stringify(getCurrentScene());
      return {
        data: new Blob([data], { type: "application/vnd.excalidraw+json" }),
        format: ".excalidraw",
      };
    },

    async getThumbnail() {
      const current = getCurrentScene();
      try {
        const svg = await exportToSvg({
          elements: current.elements as never,
          appState: {
            ...appStateForThumbnailExport(current.appState),
            exportWithDarkMode: false,
          } as never,
          files: current.files as never,
        });
        return new Blob([svg.outerHTML], { type: "image/svg+xml" });
      } catch {
        return new Blob([createExcalidrawFallbackThumbnail("Excalidraw")], {
          type: "image/svg+xml",
        });
      }
    },

    onDidChange(handler) {
      changeHandler = handler;
      return () => {
        if (changeHandler === handler) {
          changeHandler = null;
        }
      };
    },

    async onAIGenerate() {
      // AI prompt wiring is intentionally delegated to the shared settings/API layer.
    },
  };
}

export async function readExcalidrawSavePayload(editor: EditorAdapter) {
  const saved = await editor.saveData();
  return JSON.parse(await blobToText(saved.data));
}
