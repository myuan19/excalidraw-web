import { useEffect } from "react";
import { AppShell } from "@/components/app/AppShell";
import { useAppStore } from "@/stores/appStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { HomePage } from "@/pages/HomePage";
import { FilesPage } from "@/pages/FilesPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { UsersPage } from "@/pages/UsersPage";
import { editorRegistry } from "@/features/editor/EditorRegistry";
import { TEST_EDITOR_META, createTestEditor } from "@/editors/test";
import { EXCALIDRAW_EDITOR_META, createExcalidrawEditor } from "@/editors/excalidraw";
import { MINDMAP_EDITOR_META, createMindMapEditor } from "@/editors/mindmap";
import { TEXT_EDITOR_META, createTextEditor } from "@/editors/text";
import { EmbedApp } from "@/features/embed";
import { installClientLogger } from "@/features/logging";
import { useDeepLinkOpen } from "@/features/routing/useDeepLinkOpen";

editorRegistry.register(TEST_EDITOR_META, createTestEditor);
editorRegistry.register(EXCALIDRAW_EDITOR_META, createExcalidrawEditor);
editorRegistry.register(MINDMAP_EDITOR_META, createMindMapEditor);
editorRegistry.register(TEXT_EDITOR_META, createTextEditor);

export function App() {
  const activeView = useAppStore((s) => s.activeView);
  const aiConfigLoaded = useSettingsStore((s) => s.aiConfigLoaded);
  const loadAIConfig = useSettingsStore((s) => s.loadAIConfig);

  useDeepLinkOpen();

  useEffect(() => {
    installClientLogger();
    if (!aiConfigLoaded) {
      void loadAIConfig();
    }
  }, [aiConfigLoaded, loadAIConfig]);

  if (window.__EXCALIDRAW_WEB_EMBED__) {
    return <EmbedApp />;
  }

  const pages = (
    <>
      {activeView === "home" && <HomePage />}
      {activeView === "files" && <FilesPage />}
      {activeView === "settings" && <SettingsPage />}
      {activeView === "users" && <UsersPage />}
    </>
  );

  return <AppShell pages={pages} />;
}
