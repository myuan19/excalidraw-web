import { describe, expect, it } from "vitest";

import {
  isPublicEmbedStaticAssetPath,
  isTokenProtectedEmbedPath,
} from "./embedStaticPolicy.js";

describe("embed static policy", () => {
  it("treats hashed app assets and fonts as public cacheable resources", () => {
    expect(isPublicEmbedStaticAssetPath("/assets/MindMapEmbedViewer.js")).toBe(
      true,
    );
    expect(isPublicEmbedStaticAssetPath("/fonts/Virgil/Virgil.woff2")).toBe(
      true,
    );
    expect(isTokenProtectedEmbedPath("/assets/ExcalidrawEmbedViewer.js")).toBe(
      false,
    );
  });

  it("keeps document data and mind-map html behind token checks", () => {
    expect(isPublicEmbedStaticAssetPath("/api/file-1/data")).toBe(false);
    expect(isTokenProtectedEmbedPath("/api/file-1/data")).toBe(true);
    expect(isTokenProtectedEmbedPath("/mind-map/index.html")).toBe(true);
  });
});
