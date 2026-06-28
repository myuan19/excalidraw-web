import { describe, expect, it } from "vitest";

import {
  useEditorPaneLifecycle,
  useEditorPaneMountGate,
} from "./editorPaneLifecycle";

describe("editorPaneLifecycle", () => {
  it("exports lifecycle hooks", () => {
    expect(typeof useEditorPaneLifecycle).toBe("function");
    expect(typeof useEditorPaneMountGate).toBe("function");
  });
});
