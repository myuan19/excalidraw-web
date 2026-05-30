import { useEffect, useMemo, useState } from "react";
import {
  Excalidraw,
  MainMenu,
  WelcomeScreen,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useSettingsStore } from "@/stores/settingsStore";
import { useEditorStore } from "@/stores/editorStore";
import { CombinedLibraryAdapter } from "@/features/library";
import { DeltaStorage } from "@/features/sync/DeltaStorage";
import { serializeDeltaPayload } from "@/features/sync/serializeDeltaPayload";
import { editorDebugLog } from "@/features/logging/editorDebugLog";
import { sanitizeExcalidrawAppState } from "./save";
import { useExcalidrawLibrary } from "./useExcalidrawLibrary";

type SceneData = {
  elements?: readonly unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
};

export interface ExcalidrawEditorHandle {
  updateScene(data: SceneData): void;
  getSceneElements(): readonly unknown[];
  getSceneElementsIncludingDeleted(): readonly unknown[];
  getAppState(): Record<string, unknown>;
  getFiles(): Record<string, unknown>;
  refresh?(): void;
}

export function ExcalidrawEditorHost({
  initialData,
  onReady,
  onChange,
}: {
  initialData: SceneData;
  onReady(api: ExcalidrawEditorHandle): void;
  onChange(data: SceneData): void;
}) {
  const [api, setApi] = useState<ExcalidrawEditorHandle | null>(null);
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const theme = useSettingsStore((state) => state.theme);
  const language = useSettingsStore((state) => state.language);
  const activeFile = useEditorStore((state) => state.activeFile);
  useExcalidrawLibrary(excalidrawAPI);
  const effectiveTheme = theme === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : theme;
  const initial = useMemo(
    async () => {
      const libraryData = await CombinedLibraryAdapter.load();
      return {
        elements: initialData.elements ?? [],
        appState: {
          viewBackgroundColor: "rgb(255 255 255)",
          ...sanitizeExcalidrawAppState(initialData.appState),
        },
        files: initialData.files ?? {},
        libraryItems: libraryData.libraryItems,
      };
    },
    [initialData],
  );

  useEffect(() => {
    editorDebugLog("ExcalidrawEditorHost.mount", {
      theme: effectiveTheme,
      language,
      hasActiveFile: !!activeFile,
      fileId: activeFile?.id ?? null,
    });
    return () => editorDebugLog("ExcalidrawEditorHost.unmount");
  }, [activeFile?.id, effectiveTheme, language]);

  useEffect(() => {
    if (api) {
      editorDebugLog("ExcalidrawEditorHost.apiReady", { fileId: activeFile?.id ?? null });
      onReady(api);
    }
  }, [api, onReady, activeFile?.id]);

  return (
    <div className="h-full w-full bg-white">
      <Excalidraw
        initialData={initial as never}
        theme={effectiveTheme}
        langCode={language}
        excalidrawAPI={(instance) => {
          editorDebugLog("ExcalidrawEditorHost.excalidrawAPI", { hasInstance: !!instance });
          setApi(instance as unknown as ExcalidrawEditorHandle);
          setExcalidrawAPI(instance);
        }}
        onChange={(elements, appState, files) => {
          onChange({ elements, appState: appState as unknown as Record<string, unknown>, files });
        }}
        onLibraryChange={(libraryItems) => {
          void CombinedLibraryAdapter.load().then((data) => CombinedLibraryAdapter.save({
            libraryItems: libraryItems as never,
            groups: data.groups,
          }));
        }}
        {...(activeFile ? {
          onIncrement: (increment: { delta?: unknown }) => {
            if (!increment?.delta) return;
            const storable = serializeDeltaPayload(increment.delta);
            if (storable != null) {
              void DeltaStorage.record(activeFile.id, storable);
            }
          },
        } : {})}
      >
        <MainMenu>
          <MainMenu.DefaultItems.LoadScene />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.CommandPalette />
          <MainMenu.Separator />
          <MainMenu.DefaultItems.ToggleTheme />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
          <MainMenu.DefaultItems.ClearCanvas />
        </MainMenu>
        <WelcomeScreen>
          <WelcomeScreen.Center>
            <WelcomeScreen.Center.Logo />
            <WelcomeScreen.Center.Heading>Drawing Space</WelcomeScreen.Center.Heading>
            <WelcomeScreen.Center.Menu>
              <WelcomeScreen.Center.MenuItemLoadScene />
              <WelcomeScreen.Center.MenuItemHelp />
            </WelcomeScreen.Center.Menu>
          </WelcomeScreen.Center>
        </WelcomeScreen>
      </Excalidraw>
    </div>
  );
}
