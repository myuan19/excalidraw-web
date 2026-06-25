import type { ActiveEditorSaveSource } from "../../data/activeEditorSaveBridge";

export function shouldFormalizeMindMapLocalDraftSave(
  source: ActiveEditorSaveSource,
  hasRequestId: boolean,
): boolean {
  if (source === "manual" || source === "exit") {
    return true;
  }
  return source === "auto" && hasRequestId;
}

export function shouldRequestNativeSnapshotForMindMapLocalDraftAutoSave(
  source: ActiveEditorSaveSource,
  hasRequestId: boolean,
): boolean {
  return source === "auto" && !hasRequestId;
}
