import { describe, expect, it } from "vitest";

import limits from "../editor-media-limits.cjs";
import {
  EDITOR_MAX_IMAGE_DIMENSION,
  EDITOR_MAX_IMAGE_FILE_BYTES,
} from "./editorMediaLimits";

describe("editorMediaLimits", () => {
  it("uses single cjs source (8 MiB file, 8192 px edge)", () => {
    expect(EDITOR_MAX_IMAGE_FILE_BYTES).toBe(limits.maxFileBytes);
    expect(EDITOR_MAX_IMAGE_DIMENSION).toBe(limits.maxDimension);
    expect(EDITOR_MAX_IMAGE_FILE_BYTES).toBe(8 * 1024 * 1024);
    expect(EDITOR_MAX_IMAGE_DIMENSION).toBe(8192);
  });
});
