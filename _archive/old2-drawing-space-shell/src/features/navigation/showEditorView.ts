import { useAppStore } from "@/stores/appStore";

/** 唯一入口：切换到编辑器视图（不打开文件、不关闭会话） */
export function showEditorView() {
  useAppStore.getState().setActiveView("editor");
}
