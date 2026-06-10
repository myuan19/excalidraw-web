import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "../..");

describe("MindMap native source contract", () => {
  it("does not route viewport changes through document saves in takeover mode", () => {
    const source = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/native/web/src/pages/Edit/components/Edit.vue"),
      "utf8",
    );
    const viewChangeBlock = source.slice(
      source.indexOf("this.$bus.$on('view_data_change'"),
      source.indexOf("// 手动保存"),
    );

    expect(viewChangeBlock).toContain("if (window.takeOverApp)");
    expect(viewChangeBlock.indexOf("if (window.takeOverApp)")).toBeLessThan(
      viewChangeBlock.indexOf("storeData({"),
    );
  });

  it("sizes pasted node images through one shared text-width policy", () => {
    const utilsSource = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/native/simple-mind-map/src/utils/index.js"),
      "utf8",
    );
    const renderSource = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/native/simple-mind-map/src/core/render/Render.js"),
      "utf8",
    );
    const textEditSource = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/native/simple-mind-map/src/core/render/TextEdit.js"),
      "utf8",
    );
    const richTextSource = fs.readFileSync(
      path.join(appRoot, "editors/mindmap/native/simple-mind-map/src/plugins/RichText.js"),
      "utf8",
    );
    const pasteSources = [renderSource, textEditSource, richTextSource].join("\n");

    expect(utilsSource).toContain("fitPastedImageSizeToNodeText");
    expect(utilsSource).toContain("Math.min(textWidth, sixCharWidth)");
    expect(
      pasteSources.match(/const imageSize = fitPastedImageSizeToNodeText/g),
    ).toHaveLength(3);
  });
});
