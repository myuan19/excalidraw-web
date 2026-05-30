export function sanitizeThumbnailSvg(svgMarkup: string): string {
  return svgMarkup
    .replace(/<style\b[^>]*class="style-fonts"[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?@font-face[\s\S]*?<\/style>/gi, "");
}

function removeElementsByClass(svgMarkup: string, className: string): string {
  return svgMarkup.replace(
    new RegExp(
      `<([a-zA-Z][\\w:-]*)\\b(?=[^>]*\\bclass="[^"]*\\b${className}\\b[^"]*")[^>]*(?:/>|>[\\s\\S]*?</\\1>)`,
      "gi",
    ),
    "",
  );
}

function removeMindMapEditOverlays(svgMarkup: string): string {
  let svg = removeElementsByClass(svgMarkup, "smm-hover-node");
  svg = removeElementsByClass(svg, "smm-quick-create-child-btn");
  svg = removeElementsByClass(svg, "smm-expand-btn");
  svg = removeElementsByClass(svg, "smm-other-container");
  svg = removeElementsByClass(svg, "smm-outer-frame-container");
  svg = svg.replace(
    /<foreignObject\b(?:(?!<\/foreignObject>)[\s\S])*\bclass="[^"]*\bfooter\b[^"]*"(?:(?!<\/foreignObject>)[\s\S])*<\/foreignObject>/gi,
    "",
  );
  return svg.replace(/\bclass="([^"]*)"/gi, (_match, value: string) => {
    const classNames = value
      .split(/\s+/)
      .filter((item) => item && item !== "active" && item !== "smm-node-highlight");
    return `class="${classNames.join(" ")}"`;
  });
}

export function normalizeMindMapThumbnailSvg(svgMarkup: string): string {
  let svg = sanitizeThumbnailSvg(svgMarkup).replace(/^\uFEFF/, "").trim();
  if (!/<svg\b/i.test(svg)) return svg;
  if (!/\sxmlns=/i.test(svg)) {
    svg = svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return removeMindMapEditOverlays(svg);
}

export function patchThumbnailSvgForCard(svgMarkup: string): string {
  const normalized = normalizeMindMapThumbnailSvg(svgMarkup);
  return normalized.replace(
    /(<svg\b)([^>]*)(>)/i,
    (_match, open: string, attrs: string, close: string) => {
      const cleaned = attrs
        .replace(/\s+preserveAspectRatio=(?:"[^"]*"|'[^']*'|[^\s>]*)/i, "")
        .replace(/\s+width=(?:"[^"]*"|'[^']*'|[^\s>]*)/i, "")
        .replace(/\s+height=(?:"[^"]*"|'[^']*'|[^\s>]*)/i, "");
      return `${open}${cleaned} preserveAspectRatio="xMidYMid meet" width="100%" height="100%"${close}`;
    },
  );
}

export function prepareStoredThumbnailSvg(svgMarkup: string, kind: string): string {
  if (!svgMarkup.includes("<svg")) return svgMarkup;
  if (kind === "mindmap" || /class="smm-container"/.test(svgMarkup)) {
    return normalizeMindMapThumbnailSvg(svgMarkup);
  }
  return sanitizeThumbnailSvg(svgMarkup);
}
