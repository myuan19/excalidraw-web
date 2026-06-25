import { getFileIdFromHash } from "./fileIdFromHash";
import {
  readEditorTabsState,
  type FileEditorTab,
} from "../shell/editorTabs";

export function listOpenFileEditorTabs(): FileEditorTab[] {
  return readEditorTabsState().tabs.filter(
    (tab): tab is FileEditorTab => tab.type === "file",
  );
}

export function resolveForegroundEditorFileId(): string | null {
  const fromHash = getFileIdFromHash();
  if (fromHash) {
    return fromHash;
  }
  const state = readEditorTabsState();
  const active = state.tabs.find((tab) => tab.id === state.activeTabId);
  if (active?.type === "file") {
    return active.fileId;
  }
  return null;
}
