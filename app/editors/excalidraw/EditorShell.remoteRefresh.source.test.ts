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
    expect(source).toContain(
      "reload: () => reloadSceneFromServer({ preserveViewport: true })",
    );
    expect(source).toContain("onAfterRestore={async () => {");
    expect(source).toContain("await reloadSceneFromServer();");
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
