import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("MindMapEditorShell loading source contract", () => {
  it("renders a visible loading overlay until the native app is initialized", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "MindMapEditorShell.tsx"),
      "utf8",
    );

    expect(source).toContain('const [status, setStatus] = useState("加载中…")');
    expect(source).toContain(
      "const [isNativeReady, setIsNativeReady] = useState(false)",
    );
    expect(source).toContain("setIsNativeReady(false)");
    expect(source).toContain("setIsNativeReady(true)");
    expect(source).toContain('className="mindmap-editor__loading"');
    expect(source).toContain('className="editor-loading-spinner"');
    expect(source).toContain("{status}");
  });
});
