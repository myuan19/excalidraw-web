import { describe, expect, it } from "vitest";

import { detectImportCandidateKinds } from "./detectImportCandidates";

function fileFrom(
  name: string,
  content: string,
  type = "application/json",
): File {
  return new File([content], name, { type });
}

describe("detectImportCandidateKinds", () => {
  it("returns excalidraw for excalidraw extension", async () => {
    const file = fileFrom(
      "diagram.excalidraw",
      JSON.stringify({ type: "excalidraw", version: 2, elements: [], appState: {} }),
      "application/vnd.excalidraw+json",
    );
    await expect(detectImportCandidateKinds(file)).resolves.toEqual([
      "excalidraw",
    ]);
  });

  it("returns mindmap for .smm", async () => {
    const file = fileFrom("map.smm", "{}", "application/octet-stream");
    await expect(detectImportCandidateKinds(file)).resolves.toEqual(["mindmap"]);
  });

  it("returns excalidraw for png via image mime", async () => {
    const file = new File([new Uint8Array([0x89, 0x50])], "shot.png", {
      type: "image/png",
    });
    await expect(detectImportCandidateKinds(file)).resolves.toEqual([
      "excalidraw",
    ]);
  });
});
