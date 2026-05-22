import { describe, expect, it } from "vitest";
import { editorRegistry } from "@/features/editor/EditorRegistry";
import { formatEditorNameList, listHomeEditors } from "./listHomeEditors";

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

describe("listHomeEditors", () => {
  it("excludes editors with showOnHome false", () => {
    editorRegistry.register(
      {
        id: "hidden-editor",
        displayName: "Hidden",
        icon: "icon-[mdi--eye-off]",
        supportedFormats: [".hidden"],
        showOnHome: false,
      },
      stubFactory,
    );

    expect(listHomeEditors().map((entry) => entry.id)).not.toContain("hidden-editor");

    editorRegistry.unregister("hidden-editor");
  });
});

describe("formatEditorNameList", () => {
  it("formats Chinese list with 与 before last item", () => {
    expect(formatEditorNameList(["白板", "脑图", "文本"])).toBe("白板、脑图与文本");
  });
});
