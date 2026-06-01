import { createRequire } from "module";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

import {
  EDITOR_MAX_IMAGE_DIMENSION,
  EDITOR_MAX_IMAGE_FILE_BYTES,
  EDITOR_MEDIA_LIMITS,
} from "./editorMediaLimits";

const requireCjs = createRequire(import.meta.url);
const cjsPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../editor-media-limits.cjs",
);

describe("editorMediaLimits", () => {
  it("defines 8 MiB file and 8192 px edge caps", () => {
    expect(EDITOR_MAX_IMAGE_FILE_BYTES).toBe(8 * 1024 * 1024);
    expect(EDITOR_MAX_IMAGE_DIMENSION).toBe(8192);
    expect(EDITOR_MEDIA_LIMITS.maxFileBytes).toBe(EDITOR_MAX_IMAGE_FILE_BYTES);
    expect(EDITOR_MEDIA_LIMITS.maxDimension).toBe(EDITOR_MAX_IMAGE_DIMENSION);
  });

  it("editor-media-limits.cjs stays in sync (MindMap require path)", () => {
    const limits = requireCjs(cjsPath) as {
      maxFileBytes: number;
      maxDimension: number;
    };
    expect(limits.maxFileBytes).toBe(EDITOR_MEDIA_LIMITS.maxFileBytes);
    expect(limits.maxDimension).toBe(EDITOR_MEDIA_LIMITS.maxDimension);
  });
});
