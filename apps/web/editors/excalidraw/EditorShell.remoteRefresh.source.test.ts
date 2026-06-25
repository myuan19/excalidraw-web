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
    expect(source).toContain("reload: (target) =>");
    expect(source).toContain(
      "reloadFromServer({ preserveViewport: true, target })",
    );
    expect(source).toContain("onAfterRestore={async () => {");
    expect(source).toContain("await reloadFromServer();");
    expect(source).toContain("isRemoteUpdateTargetSatisfied");
  });

  it("applies cross-tab remote refresh through the remote scene boundary", () => {
    const shellSource = fs.readFileSync(
      path.join(__dirname, "EditorShell.tsx"),
      "utf8",
    );
    const applySource = fs.readFileSync(
      path.join(__dirname, "applyRemoteExcalidrawScene.ts"),
      "utf8",
    );
    const remoteRefreshSource = fs.readFileSync(
      path.join(__dirname, "../../hooks/useRemoteFileRefresh.ts"),
      "utf8",
    );

    expect(shellSource).toContain("useRemoteFileRefresh");
    expect(shellSource).not.toContain("RemoteUpdateConfirmDialog");
    expect(remoteRefreshSource).toContain("promptServerUpdateConfirm");
    expect(remoteRefreshSource).toContain("queueRemoteUpdateTarget");
    expect(shellSource).toContain(
      "loadEditorServerFile(fileId, { force: true })",
    );
    expect(applySource).toContain("pickSceneViewportAppState");
    expect(applySource).toContain("captureUpdate: CaptureUpdateAction.NEVER");
  });

  it("keeps programmatic remote updates out of local draft side effects", () => {
    const shellSource = fs.readFileSync(
      path.join(__dirname, "EditorShell.tsx"),
      "utf8",
    );
    const onChangeBlock = shellSource.slice(
      shellSource.indexOf("const handleChange = useCallback("),
      shellSource.indexOf("useEffect(() => {\n    return () => {"),
    );

    // The remote-apply guard must bail out before any local-draft side effect.
    // The modification evaluation itself lives in persistLocalExcalidrawSnapshot,
    // so that helper (invoked after the guard) is the side-effect entry point we
    // assert against here.
    expect(onChangeBlock).toContain("isRemoteApplyInProgress(fileId)");
    expect(onChangeBlock).toContain("persistLocalExcalidrawSnapshot");
    expect(
      onChangeBlock.indexOf("isRemoteApplyInProgress(fileId)"),
    ).toBeLessThan(onChangeBlock.indexOf("persistLocalExcalidrawSnapshot"));
  });
});
