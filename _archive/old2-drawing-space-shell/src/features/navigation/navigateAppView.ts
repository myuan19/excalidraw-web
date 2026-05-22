import { evaluateEditorLeave, requestLeaveEditor } from "@/features/home/goHome";
import { type AppView, useAppStore } from "@/stores/appStore";
import { useEditorStore } from "@/stores/editorStore";

/**
 * 侧栏 / 页面层导航。离开编辑器时走未保存确认；EditorLayer 保持挂载仅隐藏。
 */
export function navigateAppView(nextView: AppView) {
  const { activeView } = useAppStore.getState();
  const activeFile = useEditorStore.getState().activeFile;

  if (activeView === "editor" && nextView !== "editor") {
    if (!activeFile) {
      useAppStore.getState().setActiveView(nextView);
      return;
    }
    const result = evaluateEditorLeave(nextView);
    if (result === "prompt") {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => requestLeaveEditor());
      });
    }
    return;
  }

  useAppStore.getState().setActiveView(nextView);
}
