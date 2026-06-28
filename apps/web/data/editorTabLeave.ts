import { devDebug } from "../lib/devDebug";
import { traceIssueDiag } from "../lib/issueDiagTrace";
import { traceUserAction } from "../lib/userTrace";
import { editorRegistry } from "../editors/registry";

import { requestEditorTabSnapshot } from "./activeEditorSnapshotBridge";
import { listOpenFileEditorTabs } from "./editorTabForeground";
import { confirmEditorLeaveForFile } from "../shell/editorLeaveFlow";
import { resolveEditorHomeNavPlan } from "./editorLeaveHome";

import type { ActiveEditorSnapshotSource } from "./activeEditorSnapshotBridge";
import type { ActiveEditorSaveSource } from "./activeEditorSaveBridge";

function elapsedMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

export async function prepareEditorTabForClose(
  fileId: string,
  source: ActiveEditorSnapshotSource = "tab-close",
  _saveSource: ActiveEditorSaveSource = "exit",
): Promise<boolean> {
  const totalStartedAt = performance.now();
  const fileId8 = fileId.slice(0, 8);
  const kind = editorRegistry.resolveKind(
    listOpenFileEditorTabs().find((tab) => tab.fileId === fileId)?.kind,
  );
  traceIssueDiag(
    "desktop.close",
    "tab.prepare",
    { fileId8, source, kind },
    "start",
  );
  traceUserAction("tab", "prepareForClose", { fileId8, source }, "start");
  devDebug("shell-nav", "prepareEditorTabForClose | start", {
    fileId8,
    source,
  });

  if (resolveEditorHomeNavPlan(fileId, { kind }).action !== "prompt-leave") {
    traceIssueDiag(
      "desktop.close",
      "tab.prepare",
      {
        fileId8,
        source,
        kind,
        branch: "clean-skip-snapshot",
        totalMs: elapsedMs(totalStartedAt),
      },
      "ok",
    );
    traceUserAction(
      "tab",
      "prepareForClose",
      { fileId8, source, reason: "clean-skip-snapshot" },
      "ok",
    );
    devDebug("shell-nav", "prepareEditorTabForClose | clean skip snapshot", {
      fileId8,
      source,
    });
    return true;
  }

  const snapshotStartedAt = performance.now();
  const snapshot = await requestEditorTabSnapshot(fileId, source);
  const snapshotMs = elapsedMs(snapshotStartedAt);
  traceIssueDiag(
    "desktop.close",
    "tab.snapshot",
    {
      fileId8,
      source,
      kind,
      ok: snapshot.ok,
      reason: snapshot.reason ?? null,
      ms: snapshotMs,
    },
    snapshot.ok || source === "tab-close" ? "ok" : "fail",
  );
  if (!snapshot.ok && source !== "tab-close") {
    traceUserAction(
      "tab",
      "prepareForClose",
      { fileId8, reason: snapshot.reason ?? "snapshot-failed" },
      "fail",
    );
    return false;
  }
  if (!snapshot.ok) {
    devDebug(
      "shell-nav",
      "prepareEditorTabForClose | snapshot failed — continuing",
      {
        fileId8,
        reason: snapshot.reason ?? "snapshot-failed",
      },
    );
  }

  const confirmStartedAt = performance.now();
  const ok = await confirmEditorLeaveForFile(fileId, { kind });
  const confirmMs = elapsedMs(confirmStartedAt);
  traceIssueDiag(
    "desktop.close",
    "tab.prepare",
    {
      fileId8,
      source,
      kind,
      ok,
      snapshotMs,
      confirmMs,
      totalMs: elapsedMs(totalStartedAt),
    },
    ok ? "ok" : "fail",
  );
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
  const totalStartedAt = performance.now();
  const tabs = listOpenFileEditorTabs();
  traceIssueDiag(
    "desktop.close",
    "prepareAll",
    { tabCount: tabs.length, fileIds8: tabs.map((t) => t.fileId.slice(0, 8)) },
    "start",
  );
  traceUserAction(
    "tab",
    "prepareAllForClose",
    { tabCount: tabs.length, fileIds8: tabs.map((t) => t.fileId.slice(0, 8)) },
    "start",
  );
  devDebug("shell-nav", "prepareAllOpenEditorTabsForClose | start", {
    tabCount: tabs.length,
  });
  for (const [index, tab] of tabs.entries()) {
    const tabStartedAt = performance.now();
    if (!(await prepareEditorTabForClose(tab.fileId, "tab-close", "exit"))) {
      traceIssueDiag(
        "desktop.close",
        "prepareAll",
        {
          tabCount: tabs.length,
          failedIndex: index,
          failedFileId8: tab.fileId.slice(0, 8),
          tabMs: elapsedMs(tabStartedAt),
          totalMs: elapsedMs(totalStartedAt),
        },
        "fail",
      );
      traceUserAction(
        "tab",
        "prepareAllForClose",
        { failedFileId8: tab.fileId.slice(0, 8) },
        "fail",
      );
      return false;
    }
    traceIssueDiag(
      "desktop.close",
      "prepareAll.tab",
      {
        tabCount: tabs.length,
        index,
        fileId8: tab.fileId.slice(0, 8),
        kind: tab.kind,
        ms: elapsedMs(tabStartedAt),
      },
      "ok",
    );
  }
  traceIssueDiag(
    "desktop.close",
    "prepareAll",
    { tabCount: tabs.length, totalMs: elapsedMs(totalStartedAt) },
    "ok",
  );
  traceUserAction("tab", "prepareAllForClose", { tabCount: tabs.length }, "ok");
  return true;
}
