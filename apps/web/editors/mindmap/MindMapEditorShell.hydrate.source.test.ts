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
    expect(source).toContain('debugMindMapPersist("hydrate draft rejected"');
    expect(source).not.toContain("forwardMindMapHostDebug(\"mindmap-bridge\"");
    expect(source).not.toContain("explainHydrateDraftDecision");
  });

  it("defers and rearms idle auto-save around native hydrate", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "MindMapEditorShell.tsx"),
      "utf8",
    );

    expect(source).toContain("rearmDeferredAutoSave");
    expect(source).toContain("clearDeferredAutoSave");
    expect(source).toContain('return "deferred"');
  });

  it("handles native config persistence without clearing pending dirty state", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "MindMapEditorShell.tsx"),
      "utf8",
    );

    expect(source).toContain('event.data.type === "saveMindMapConfig"');
    expect(source).toContain('event.data.type === "saveLocalConfig"');
    expect(source).toContain("isMindMapNativeDirtyPending(fileId)");
  });

  it("does not write native draft thumbnails without a hash binding", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "MindMapEditorShell.tsx"),
      "utf8",
    );

    expect(source).toContain("cacheDraftThumbnailIfVisible");
    expect(source).not.toContain("LocalThumbnailCache.set(fileId, resolvedThumbnail)");
    expect(source).not.toContain("LocalThumbnailCache.set(fileId, decodedThumb)");
  });

  it("keeps expand/collapse dirty state through hydrate draft pushes", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "MindMapEditorShell.tsx"),
      "utf8",
    );

    expect(source).toContain("!hasUserDirtyPending");
    expect(source).toContain(
      "isMindMapNativeDirtyPending(fileId) &&\n            !isCurrentSaveResponse",
    );
  });
});
