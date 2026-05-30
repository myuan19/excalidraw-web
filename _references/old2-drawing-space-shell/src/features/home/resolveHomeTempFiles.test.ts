import { beforeEach, describe, expect, it, vi } from "vitest";
import { editorRegistry } from "@/features/editor/EditorRegistry";
import { TempFileStorage } from "@/features/tempFiles/TempFileStorage";
import { resolveHomeTempFiles } from "./resolveHomeTempFiles";

const stubFactory = () => ({
  id: "stub",
  displayName: "Stub",
  icon: "",
  supportedFormats: [],
  mount: () => undefined,
  unmount: () => undefined,
  loadData: async () => undefined,
  saveData: async () => ({ data: new Blob(), format: ".stub" }),
  getThumbnail: async () => new Blob(),
});

function installStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  });
  vi.stubGlobal("window", {
    dispatchEvent: vi.fn(),
  });
}

describe("resolveHomeTempFiles", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    installStorage();
  });

  it("returns at most one temp per editor kind", () => {
    TempFileStorage.upsert({
      id: "local-temp:old",
      name: "Old board",
      kind: "excalidraw",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    TempFileStorage.upsert({
      id: "local-temp:new",
      name: "New board",
      kind: "excalidraw",
      created_at: "2026-01-02T00:00:00.000Z",
      updated_at: "2026-01-03T00:00:00.000Z",
    });
    TempFileStorage.upsert({
      id: "local-temp:map",
      name: "Map",
      kind: "mindmap",
      created_at: "2026-01-02T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
    });

    const resolved = resolveHomeTempFiles();
    expect(resolved).toHaveLength(2);
    expect(resolved.find((f) => f.kind === "excalidraw")?.id).toBe("local-temp:new");
    expect(resolved.find((f) => f.kind === "mindmap")?.name).toBe("Map");
  });

  it("caps visible kinds to registered editors", () => {
    editorRegistry.register(
      {
        id: "extra-editor",
        displayName: "Extra",
        icon: "icon-[mdi--puzzle]",
        supportedFormats: [".x"],
        fileKind: "extra",
        showOnHome: false,
      },
      stubFactory,
    );
    TempFileStorage.upsert({
      id: "local-temp:extra",
      name: "Extra temp",
      kind: "extra",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    TempFileStorage.upsert({
      id: "local-temp:orphan",
      name: "Orphan",
      kind: "unknown-kind",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const resolved = resolveHomeTempFiles();
    expect(resolved.map((f) => f.kind)).toContain("extra");
    expect(resolved.map((f) => f.kind)).not.toContain("unknown-kind");

    editorRegistry.unregister("extra-editor");
  });
});
