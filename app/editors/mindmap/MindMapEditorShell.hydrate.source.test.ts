import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("MindMapEditorShell hydrate source contract", () => {
  it("delegates hydrate session and draft handling to mindMapHydrateCoordinator", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "MindMapEditorShell.tsx"),
      "utf8",
    );
    expect(source).toContain('from "./mindMapHydrateCoordinator"');
    expect(source).toContain("createMindMapHydrateCoordinator");
    expect(source).toContain("handleDraftPush");
    expect(source).toContain("hydrateCoordinatorRef.current.settle");
    expect(source).toContain("isMindMapNativeDirtyPending(fileId)");
    expect(source).toContain(
      'debugMindMapPersist("native hydrate settle kept user dirty state"',
    );
    expect(source).not.toContain("deferredAutoSaveDuringHydrateRef");
    expect(source).toContain("rearmDeferredAutoSave()");
    expect(source).toContain("clearDeferredAutoSave()");
    expect(source).toContain(
      'debugMindMapPersist("auto save rearmed after hydrate"',
    );
    expect(source).toContain('return "deferred"');
    expect(source).toContain(
      "config change skipped while native dirty pending",
    );
    expect(source).toContain(
      "config change skipped while file has unsaved changes",
    );
    expect(source).toContain("isMindMapNativeDirtyPending(fileId) &&");
    expect(source).toContain('debugMindMapPersist("hydrate draft rejected"');
    expect(source).not.toContain("forwardMindMapHostDebug(\"mindmap-bridge\"");
    expect(source).not.toContain("explainHydrateDraftDecision");
  });
});
