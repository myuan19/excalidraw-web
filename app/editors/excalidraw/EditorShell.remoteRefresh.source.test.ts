import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("EditorShell remote refresh source contract", () => {
  it("preserves viewport only for cross-tab remote refresh", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "EditorShell.tsx"),
      "utf8",
    );
    expect(source).toContain("applyRemoteExcalidrawScene");
    expect(source).toContain("preserveViewport?: boolean");
    expect(source).toContain("preserveViewport: !!opts?.preserveViewport");
    expect(source).toContain("runRemoteSceneApply");
    expect(source).toContain("reload: (target) =>");
    expect(source).toContain(
      "reloadSceneFromServer({ preserveViewport: true, target })",
    );
    expect(source).toContain("onAfterRestore={async () => {");
    expect(source).toContain("await reloadSceneFromServer();");
  });

  it("passes host file name into Excalidraw instead of using native untitled fallback", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "EditorShell.tsx"),
      "utf8",
    );
    expect(source).toContain("const excalidrawHostFileName =");
    expect(source).toContain("tabFileName ?? DEFAULT_DOCUMENT_DISPLAY_NAME");
    expect(source).toContain("name={excalidrawHostFileName}");
    expect(source).toContain("resolveCanonicalExcalidrawFileName");
    expect(source).not.toContain("excalidrawAPI?.getAppState().name");
  });

  it("does not route remote scene application through local edit side effects", () => {
    const shellSource = fs.readFileSync(
      path.join(__dirname, "EditorShell.tsx"),
      "utf8",
    );
    const applySource = fs.readFileSync(
      path.join(__dirname, "applyRemoteExcalidrawScene.ts"),
      "utf8",
    );
    const onChangeBlock = shellSource.slice(
      shellSource.indexOf("const onChange = ("),
      shellSource.indexOf("const onIncrement = useCallback"),
    );

    expect(applySource).toContain("captureUpdate: CaptureUpdateAction.NEVER");
    expect(onChangeBlock).toContain("const isRemoteSceneApply");
    expect(onChangeBlock).toContain(
      "if (!isRemoteSceneApply && !document.hidden)",
    );
    expect(onChangeBlock).toContain(
      "if (!isRemoteSceneApply && fid && excalidrawAPI)",
    );
  });
});
