import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FileCardThumb } from "./FileCardThumb";

describe("FileCardThumb", () => {
  it("renders image data URLs as img sources instead of text", () => {
    const dataUrl =
      "data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMSAxIj48L3N2Zz4=";
    const html = renderToStaticMarkup(
      <FileCardThumb kind="excalidraw" cardThumbSvg={dataUrl} />,
    );

    expect(html).toContain(`src="${dataUrl}"`);
    expect(html).not.toContain(`>${dataUrl}<`);
  });

  it("keeps raw SVG thumbnails inline", () => {
    const html = renderToStaticMarkup(
      <FileCardThumb
        kind="excalidraw"
        cardThumbSvg={'<svg viewBox="0 0 1 1"><path /></svg>'}
      />,
    );

    expect(html).toContain("<svg");
    expect(html).toContain("<path");
  });
});
