import { create } from "zustand";
import { editorDebugLog } from "@/features/logging/editorDebugLog";
import { getFileIdFromLocation } from "@/features/routing/fileDeepLink";

export type AppView = "home" | "editor" | "files" | "settings" | "users";

function resolveInitialActiveView(): AppView {
  if (typeof window === "undefined") return "home";
  return getFileIdFromLocation() ? "editor" : "home";
}

interface AppState {
  activeView: AppView;
  pendingNavigateView: AppView | null;
  tempSessionDialogOpen: boolean;
  pendingNewTempKind: string | null;
  setActiveView: (view: AppView) => void;
  setPendingNavigateView: (view: AppView | null) => void;
  openTempSessionDialog: (kind: string | null) => void;
  closeTempSessionDialog: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeView: resolveInitialActiveView(),
  pendingNavigateView: null,
  tempSessionDialogOpen: false,
  pendingNewTempKind: null,
  setActiveView: (activeView) => {
    const prev = useAppStore.getState().activeView;
    editorDebugLog("appStore.setActiveView", { from: prev, to: activeView });
    set({ activeView });
  },
  setPendingNavigateView: (pendingNavigateView) => set({ pendingNavigateView }),
  openTempSessionDialog: (kind) => set({
    tempSessionDialogOpen: true,
    pendingNewTempKind: kind,
  }),
  closeTempSessionDialog: () => set({
    tempSessionDialogOpen: false,
    pendingNewTempKind: null,
  }),
}));
