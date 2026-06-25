import { devDebug } from "../lib/devDebug";
import { traceUserAction } from "../lib/userTrace";
import { editorRegistry } from "../editors/registry";

import {
  requestEditorTabSnapshot,
  type ActiveEditorSaveSource,
} from "./activeEditorSnapshotBridge";
import { listOpenFileEditorTabs } from "./editorTabForeground";
import { confirmEditorLeaveForFile } from "../shell/editorLeaveFlow";

import type { ActiveEditorSnapshotSource } from "./activeEditorSnapshotBridge";

export async function prepareEditorTabForClose(
  fileId: string,
  source: ActiveEditorSnapshotSource = "tab-close",
  _saveSource: ActiveEditorSaveSource = "exit",
): Promise<boolean> {
  const fileId8 = fileId.slice(0, 8);
  const kind = editorRegistry.resolveKind(
    listOpenFileEditorTabs().find((tab) => tab.fileId === fileId)?.kind,
  );
  traceUserAction(
    "tab",
    "prepareForClose",
    { fileId8, source },
    "start",
  );
  devDebug("shell-nav", "prepareEditorTabForClose | start", { fileId8, source });

  const snapshot = await requestEditorTabSnapshot(fileId, source);
  if (!snapshot.ok) {
    traceUserAction(
      "tab",
      "prepareForClose",
      { fileId8, reason: snapshot.reason ?? "snapshot-failed" },
      "fail",
    );
    return false;
  }

  const ok = await confirmEditorLeaveForFile(fileId, { kind });
  traceUserAction(
    "tab",
    "prepareForClose",
    { fileId8, ok },
    ok ? "ok" : "fail",
  );
  devDebug("shell-nav", "prepareEditorTabForClose | done", { fileId8, ok });
  return ok;
}

export async function prepareAllOpenEditorTabsForClose(): Promise<boolean> {
  const tabs = listOpenFileEditorTabs();
  traceUserAction(
    "tab",
    "prepareAllForClose",
    { tabCount: tabs.length, fileIds8: tabs.map((t) => t.fileId.slice(0, 8)) },
    "start",
  );
  devDebug("shell-nav", "prepareAllOpenEditorTabsForClose | start", {
    tabCount: tabs.length,
  });
  for (const tab of tabs) {
    if (!(await prepareEditorTabForClose(tab.fileId))) {
      traceUserAction(
        "tab",
        "prepareAllForClose",
        { failedFileId8: tab.fileId.slice(0, 8) },
        "fail",
      );
      return false;
    }
  }
  traceUserAction("tab", "prepareAllForClose", { tabCount: tabs.length }, "ok");
  return true;
}
