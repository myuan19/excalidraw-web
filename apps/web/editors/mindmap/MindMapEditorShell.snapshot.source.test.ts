import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("MindMap editor snapshot source contract", () => {
  it("registers a local snapshot handler that does not use the formal save path", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "MindMapEditorShell.tsx"),
      "utf8",
    );

    expect(source).toContain("registerEditorTabSnapshotHandler");
    expect(source).toContain("requestNativeSnapshot");
    expect(source).toContain("pendingNativeSnapshotRequestIdRef");
    expect(source).toContain("isCurrentSnapshotResponse");
    expect(source).toContain("recordMindMapDraft(fileId, document)");
    expect(source).toContain("tab-switch");
    expect(source).not.toContain('requestNativeSave("tab-switch"');
    expect(source).not.toContain('requestNativeSave("tab-close"');
  });

  it("schedules async thumbnail upload after server save commits", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "MindMapEditorShell.tsx"),
      "utf8",
    );
    const scheduleIndex = source.indexOf("scheduleSavedFileThumbnailUpload({");
    const afterScheduleBlock = source.slice(
      scheduleIndex,
      source.indexOf("traceMindMapOperation(\"host.persistMindMapDocument.server.after\"", scheduleIndex),
    );

    expect(scheduleIndex).toBeGreaterThan(-1);
    expect(source).toContain("lastSavedThumbnailTargetRef");
  });
});
