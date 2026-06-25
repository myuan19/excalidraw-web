import { describe, expect, it } from "vitest";

import {
  getLocalDraftPresetFolderIdForFile,
  localDraftNeedsSaveFolderPicker,
  resolveLocalDraftPresetFolderId,
  shouldSkipLocalDraftFormalSave,
  shouldUseNativeSaveDialogForDraft,
} from "./localDraftSaveFolder";
import { LocalDraftSessions } from "./localDraftSessions";

describe("localDraftSaveFolder", () => {
  it("treats null and undefined folder ids as needing a picker", () => {
    expect(resolveLocalDraftPresetFolderId(null)).toBeUndefined();
    expect(resolveLocalDraftPresetFolderId(undefined)).toBeUndefined();
    expect(localDraftNeedsSaveFolderPicker(null)).toBe(true);
    expect(localDraftNeedsSaveFolderPicker("folder-1")).toBe(false);
  });

  it("reads preset folder from draft session metadata", () => {
    const draftId = "local-draft:test-save-folder";
    LocalDraftSessions.upsert({
      id: draftId,
      name: "Draft",
      kind: "excalidraw",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      folder_id: null,
    });
    expect(getLocalDraftPresetFolderIdForFile(draftId)).toBeUndefined();

    LocalDraftSessions.upsert({
      id: draftId,
      name: "Draft",
      kind: "excalidraw",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      folder_id: "mapped-folder",
    });
    expect(getLocalDraftPresetFolderIdForFile(draftId)).toBe("mapped-folder");
  });

  it("opens the folder picker on manual and exit save without a folder", () => {
    expect(shouldSkipLocalDraftFormalSave("manual", null)).toBe(false);
    expect(shouldSkipLocalDraftFormalSave("exit", null)).toBe(false);
    expect(shouldSkipLocalDraftFormalSave("auto", null)).toBe(true);
    expect(shouldSkipLocalDraftFormalSave("manual", "folder-1")).toBe(false);
  });

  it("uses native save for recent-view drafts even when folder metadata exists", () => {
    const draftId = "local-draft:recent-native";
    LocalDraftSessions.upsert({
      id: draftId,
      name: "Recent draft",
      kind: "excalidraw",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      folder_id: "mapped-folder",
      save_target: "native",
    });
    expect(shouldUseNativeSaveDialogForDraft(draftId)).toBe(true);
  });

  it("uses catalog folder picker for local directory drafts", () => {
    const draftId = "local-draft:catalog-draft";
    LocalDraftSessions.upsert({
      id: draftId,
      name: "Catalog draft",
      kind: "excalidraw",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      folder_id: "mapped-folder",
      save_target: "catalog",
    });
    expect(shouldUseNativeSaveDialogForDraft(draftId)).toBe(false);
  });
});
