import { devDebug, isDevDebugChannelEnabled } from "../lib/devDebug";
import {
  FILE_LIST_THUMB_EXPORT_PADDING,
  FILE_LIST_THUMB_MIN_VIEWPORT_HEIGHT,
  FILE_LIST_THUMB_MIN_VIEWPORT_WIDTH,
  appStateForThumbnailExport,
} from "./thumbnailExport";
import { expandRectToMinimumSize } from "./thumbnailViewport";
import {
  computeMindMapFocusedViewBoxFromNodeBounds,
  formatMindMapViewBox,
  buildMindMapThumbnailFocusedViewBoxOptions,
} from "../editors/mindmap/mindMapFocusedViewBox.js";

/** Remove broken embedded fonts from exported SVG thumbnails. */
export function sanitizeThumbnailSvg(svgMarkup: string): string {
  return svgMarkup
    .replace(/<style\b[^>]*class="style-fonts"[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?@font-face[\s\S]*?<\/style>/gi, "");
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function getSvgOpenTag(svgMarkup: string): string {
  return svgMarkup.match(/<svg\b[^>]*>/i)?.[0] ?? "";
}

function decodeBase64Utf8(payload: string): string {
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder("utf-8").decode(bytes);
}

function decodeSvgDataUrl(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^data:image\/svg\+xml([^,]*),(.*)$/is);
  if (!match) {
    return value;
  }
  const meta = match[1] ?? "";
  const payload = match[2] ?? "";
  try {
    if (/;base64/i.test(meta)) {
      return decodeBase64Utf8(payload);
    }
    return decodeURIComponent(payload);
  } catch {
    return value;
  }
}

function getSvgAttr(svgMarkup: string, name: string): string {
  return (
    getSvgOpenTag(svgMarkup).match(
      new RegExp(`\\s${name}="([^"]*)"`, "i"),
    )?.[1] ?? ""
  );
}

export function isMindMapThumbnailDebugEnabled(): boolean {
  return isDevDebugChannelEnabled("mindmap-thumbnail");
}

function roundDebugNumber(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : value;
}

function debugBounds(bounds: Bounds | null | undefined) {
  return bounds
    ? {
        x: roundDebugNumber(bounds.x),
        y: roundDebugNumber(bounds.y),
        width: roundDebugNumber(bounds.width),
        height: roundDebugNumber(bounds.height),
      }
    : null;
}

function countMatches(svgMarkup: string, pattern: RegExp): number {
  return [...svgMarkup.matchAll(pattern)].length;
}

function debugMindMapThumbnail(
  label: string,
  data: Record<string, unknown>,
): void {
  if (!isMindMapThumbnailDebugEnabled()) {
    return;
  }
  devDebug("mindmap-thumbnail", label, data);
}

function setOrAddSvgAttr(
  svgMarkup: string,
  name: string,
  value: string,
): string {
  const openTag = getSvgOpenTag(svgMarkup);
  if (!openTag) {
    return svgMarkup;
  }
  if (new RegExp(`\\s${name}=`, "i").test(openTag)) {
    return svgMarkup.replace(
      new RegExp(`\\s${name}="[^"]*"`, "i"),
      ` ${name}="${escapeXmlAttr(value)}"`,
    );
  }
  return svgMarkup.replace(/<svg\b/i, `<svg ${name}="${escapeXmlAttr(value)}"`);
}

function deriveSvgViewBox(svgMarkup: string): string {
  const viewBox = getSvgAttr(svgMarkup, "viewBox");
  if (viewBox) {
    return viewBox;
  }
  return deriveSvgBoundsViewBox(svgMarkup);
}

function deriveSvgBoundsViewBox(svgMarkup: string): string {
  const width = Number.parseFloat(getSvgAttr(svgMarkup, "width"));
  const height = Number.parseFloat(getSvgAttr(svgMarkup, "height"));
  if (
    Number.isFinite(width) &&
    width > 0 &&
    Number.isFinite(height) &&
    height > 0
  ) {
    return `0 0 ${width} ${height}`;
  }
  return "0 0 1 1";
}

function decodeXmlTextEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(Number.parseInt(dec, 10)),
    )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function hasCjk(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

/** Recover UTF-8 text that was previously mis-decoded as Latin-1 (common thumbnail mojibake). */
function repairMojibakeUtf8(value: string): string {
  if (!value || hasCjk(value)) {
    return value;
  }
  if (!/[\u0080-\u024f]/.test(value)) {
    return value;
  }
  try {
    const bytes = Uint8Array.from(value, (char) => char.charCodeAt(0) & 0xff);
    const repaired = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (hasCjk(repaired)) {
      return repaired;
    }
  } catch {
    // not recoverable mojibake
  }
  return value;
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function mindMapRichTextToPlainText(value: string): string {
  return repairMojibakeUtf8(
    decodeXmlTextEntities(value)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p\s*>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{2,}/g, "\n")
      .trim(),
  );
}

function normalizeMindMapTextNodes(svgMarkup: string): string {
  return svgMarkup.replace(
    /(<text\b[^>]*>)([\s\S]*?)(<\/text>)/gi,
    (_match, open: string, text: string, close: string) => {
      const plain = mindMapRichTextToPlainText(text);
      return `${open}${escapeXmlText(plain)}${close}`;
    },
  );
}

function repairMindMapForeignObjectText(svgMarkup: string): string {
  return svgMarkup.replace(
    /(<foreignObject\b[^>]*>)([\s\S]*?)(<\/foreignObject>)/gi,
    (_match, open: string, inner: string, close: string) =>
      `${open}${inner.replace(
        />([^<>]+)</g,
        (_textMatch: string, text: string) => `>${repairMojibakeUtf8(text)}<`,
      )}${close}`,
  );
}

function hasClassToken(markup: string, className: string): boolean {
  const classValue = markup.match(/\bclass="([^"]*)"/i)?.[1] ?? "";
  return classValue.split(/\s+/).includes(className);
}

const DEFAULT_MINDMAP_ROOT_SIZE = { width: 154, height: 45 };
const MINDMAP_THUMB_NORMALIZED_ATTR = "data-excal-mindmap-thumb-normalized";
const MINDMAP_THUMB_NORMALIZED_VERSION = "1";
const MINDMAP_THUMB_SOURCE_ATTR = "data-excal-thumb-source";
const LEGACY_MINDMAP_THUMB_SOURCE_ATTR = "data-excal-mindmap-thumb-source";

function isMindMapThumbNormalized(svgMarkup: string): boolean {
  return (
    getSvgAttr(svgMarkup, MINDMAP_THUMB_NORMALIZED_ATTR) ===
    MINDMAP_THUMB_NORMALIZED_VERSION
  );
}

function isMindMapThumbnailSvg(svgMarkup: string): boolean {
  return /class="[^"]*\bsmm-container\b/i.test(svgMarkup);
}

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function parseTranslate(markup: string): Point | null {
  // SVG.js v3 always serializes transforms as matrix(a,b,c,d,e,f)
  const matrixMatch = markup.match(
    /transform="matrix\([^,]+,[^,]+,[^,]+,[^,]+,([^,]+),([^)]+)\)"/,
  );
  if (matrixMatch) {
    const x = Number.parseFloat(matrixMatch[1]);
    const y = Number.parseFloat(matrixMatch[2]);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }
  return null;
}

function getNumberAttr(markup: string, name: string): number | null {
  const value = markup.match(new RegExp(`\\s${name}="([^"]*)"`, "i"))?.[1];
  if (!value) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getStringAttr(markup: string, name: string): string {
  return markup.match(new RegExp(`\\s${name}="([^"]*)"`, "i"))?.[1] ?? "";
}

function getContainerOffset(svgMarkup: string): Point {
  const container = svgMarkup.match(
    /<g\b[^>]*class="[^"]*\bsmm-container\b[^"]*"[^>]*>/i,
  );
  return container
    ? parseTranslate(container[0]) ?? { x: 0, y: 0 }
    : { x: 0, y: 0 };
}

function isTransparentHelperRect(markup: string): boolean {
  const fill = getStringAttr(markup, "fill").trim().toLowerCase();
  return fill === "transparent" || fill === "none";
}

function parseMindMapPathShapeBounds(markup: string): Bounds | null {
  const shape = [...markup.matchAll(/<path\b[^>]*>/gi)].find((path) =>
    hasClassToken(path[0], "smm-node-shape"),
  )?.[0];
  if (!shape) {
    return null;
  }
  const values =
    getStringAttr(shape, "d")
      .match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)
      ?.map(Number) ?? [];
  if (values.length < 4) {
    return null;
  }
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i + 1 < values.length; i += 2) {
    xs.push(values[i]);
    ys.push(values[i + 1]);
  }
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) {
    return null;
  }
  const offset = parseTranslate(shape) ?? { x: 0, y: 0 };
  return {
    x: minX + offset.x,
    y: minY + offset.y,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function unionBounds(a: Bounds, b: Bounds): Bounds {
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/** 收起子节点时节点后方的小圆球（smm-expand-btn），缩略图需保留。 */
function getMindMapNodeExpandBtnBounds(nodeMarkup: string): Bounds | null {
  const expandTagMatch = nodeMarkup.match(
    /<g\b[^>]*\bclass="[^"]*\bsmm-expand-btn\b[^"]*"[^>]*>/i,
  );
  if (!expandTagMatch || expandTagMatch.index === undefined) {
    return null;
  }
  const position = parseTranslate(expandTagMatch[0]) ?? { x: 0, y: 0 };
  const sliceStart = expandTagMatch.index;
  const sliceEnd = nodeMarkup.indexOf("</g>", sliceStart);
  const expandMarkup = nodeMarkup.slice(
    sliceStart,
    sliceEnd >= 0 ? sliceEnd : sliceStart + 400,
  );
  const circleMatch = expandMarkup.match(/<circle\b[^>]*>/i);
  if (!circleMatch) {
    const size = 18;
    return {
      x: position.x,
      y: position.y - size / 2,
      width: size,
      height: size,
    };
  }
  const circle = circleMatch[0];
  const r = getNumberAttr(circle, "r");
  const cx = Number.parseFloat(getStringAttr(circle, "cx") || "0");
  const cy = Number.parseFloat(getStringAttr(circle, "cy") || "0");
  if (r) {
    return {
      x: position.x + cx - r,
      y: position.y + cy - r,
      width: r * 2,
      height: r * 2,
    };
  }
  const width = getNumberAttr(circle, "width") ?? 18;
  const height = getNumberAttr(circle, "height") ?? width;
  return {
    x: position.x + cx - width / 2,
    y: position.y + cy - height / 2,
    width,
    height,
  };
}

function getMindMapNodeContentBounds(nodeMarkup: string): Bounds | null {
  const shapeBounds = getMindMapNodeShapeBounds(nodeMarkup);
  const expandBounds = getMindMapNodeExpandBtnBounds(nodeMarkup);
  if (shapeBounds && expandBounds) {
    return unionBounds(shapeBounds, expandBounds);
  }
  return shapeBounds ?? expandBounds;
}

function getMindMapNodeShapeBounds(markup: string): Bounds | null {
  const pathBounds = parseMindMapPathShapeBounds(markup);
  if (pathBounds) {
    return pathBounds;
  }

  const rects = [...markup.matchAll(/<rect\b[^>]*>/gi)].map(
    (match) => match[0],
  );
  const rect =
    rects.find((item) => hasClassToken(item, "smm-node-shape")) ??
    rects.find(
      (item) =>
        !hasClassToken(item, "smm-hover-node") &&
        !isTransparentHelperRect(item),
    ) ??
    rects.find((item) => hasClassToken(item, "smm-hover-node")) ??
    rects[0];
  if (rect) {
    const width = getNumberAttr(rect, "width");
    const height = getNumberAttr(rect, "height");
    if (width && height) {
      const x = Number.parseFloat(getStringAttr(rect, "x") || "0");
      const y = Number.parseFloat(getStringAttr(rect, "y") || "0");
      return {
        x: Number.isFinite(x) ? x : 0,
        y: Number.isFinite(y) ? y : 0,
        width,
        height,
      };
    }
  }
  return null;
}

function getMindMapNodeOpenTags(
  svgMarkup: string,
): { index: number; markup: string }[] {
  return [
    ...svgMarkup.matchAll(/<g\b[^>]*\bclass="[^"]*smm-node[^"]*"[^>]*>/gi),
  ]
    .filter((match) => hasClassToken(match[0], "smm-node"))
    .map((match) => ({
      index: match.index ?? 0,
      markup: match[0],
    }));
}

function parseMindMapNodeBounds(svgMarkup: string): Bounds[] {
  const container = getContainerOffset(svgMarkup);
  const bounds: Bounds[] = [];
  const nodeOpenTags = getMindMapNodeOpenTags(svgMarkup);
  for (let index = 0; index < nodeOpenTags.length; index++) {
    const nodeOpenTag = nodeOpenTags[index];
    const position = parseTranslate(nodeOpenTag.markup) ?? { x: 0, y: 0 };
    const nextNodeOpenTag = nodeOpenTags[index + 1];
    const nodeMarkup = svgMarkup.slice(
      nodeOpenTag.index,
      nextNodeOpenTag?.index ?? svgMarkup.length,
    );
    const shapeBounds = getMindMapNodeContentBounds(nodeMarkup);
    bounds.push({
      x: position.x + container.x + (shapeBounds?.x ?? 0),
      y: position.y + container.y + (shapeBounds?.y ?? 0),
      width: shapeBounds?.width ?? DEFAULT_MINDMAP_ROOT_SIZE.width,
      height: shapeBounds?.height ?? DEFAULT_MINDMAP_ROOT_SIZE.height,
    });
  }
  return bounds;
}

function computeMindMapFocusedViewBox(svgMarkup: string): string {
  const nodeBounds = parseMindMapNodeBounds(svgMarkup);
  const focused = computeMindMapFocusedViewBoxFromNodeBounds(
    nodeBounds,
    buildMindMapThumbnailFocusedViewBoxOptions(),
  );
  if (!focused) {
    const fallbackViewBox = deriveSvgBoundsViewBox(svgMarkup);
    debugMindMapThumbnail("focused viewBox fallback: no root", {
      sourceViewBox: getSvgAttr(svgMarkup, "viewBox") || null,
      fallbackViewBox,
      svgLen: svgMarkup.length,
      nodeCount: nodeBounds.length,
      smmNodeMatches: countMatches(
        svgMarkup,
        /<g\b[^>]*class="[^"]*\bsmm-node\b[^"]*"/gi,
      ),
    });
    return fallbackViewBox;
  }

  const viewBox = formatMindMapViewBox(focused);
  debugMindMapThumbnail("focused viewBox computed", {
    sourceViewBox: getSvgAttr(svgMarkup, "viewBox") || null,
    viewBox,
    svgSize: {
      width: getSvgAttr(svgMarkup, "width") || null,
      height: getSvgAttr(svgMarkup, "height") || null,
    },
    nodeCount: focused.nodeCount,
    rootBounds: debugBounds(focused.rootBounds),
    otherBounds: debugBounds(focused.otherBounds),
    rootScreen: {
      centerX: roundDebugNumber(focused.rootScreen.centerX),
      centerY: roundDebugNumber(focused.rootScreen.centerY),
      width: roundDebugNumber(focused.rootScreen.width),
      height: roundDebugNumber(focused.rootScreen.height),
    },
    viewSize: debugBounds({
      x: 0,
      y: 0,
      width: focused.width,
      height: focused.height,
    }),
    firstNodeBounds: nodeBounds.slice(0, 6).map(debugBounds),
    controlCounts: {
      hover: countMatches(svgMarkup, /\bsmm-hover-node\b/gi),
      quickCreate: countMatches(svgMarkup, /\bsmm-quick-create-child-btn\b/gi),
      expand: countMatches(svgMarkup, /\bsmm-expand-btn\b/gi),
      nodeAdd: countMatches(svgMarkup, /\bsmm-node-add\b/gi),
      otherContainer: countMatches(svgMarkup, /\bsmm-other-container\b/gi),
    },
  });
  return viewBox;
}

function cropMindMapViewBox(svgMarkup: string): string {
  return setOrAddSvgAttr(
    svgMarkup,
    "viewBox",
    computeMindMapFocusedViewBox(svgMarkup),
  );
}

function removeElementByClassAt(
  svgMarkup: string,
  className: string,
  fromIndex = 0,
): { svg: string; removed: boolean } {
  const pattern = new RegExp(
    `<([a-zA-Z][\\w:-]*)\\b(?=[^>]*\\bclass="[^"]*\\b${className}\\b[^"]*")[^>]*>`,
    "gi",
  );
  pattern.lastIndex = fromIndex;
  const openMatch = pattern.exec(svgMarkup);
  if (!openMatch || openMatch.index === undefined) {
    return { svg: svgMarkup, removed: false };
  }

  const tagName = openMatch[1];
  const openEnd = openMatch.index + openMatch[0].length;
  if (/\/>\s*$/i.test(openMatch[0])) {
    return {
      svg: svgMarkup.slice(0, openMatch.index) + svgMarkup.slice(openEnd),
      removed: true,
    };
  }

  const closeTag = `</${tagName}>`;
  let depth = 1;
  let cursor = openEnd;
  const openTagPattern = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  const closeTagPattern = new RegExp(`</${tagName}>`, "gi");

  while (depth > 0 && cursor < svgMarkup.length) {
    openTagPattern.lastIndex = cursor;
    closeTagPattern.lastIndex = cursor;
    const nextOpen = openTagPattern.exec(svgMarkup);
    const nextClose = closeTagPattern.exec(svgMarkup);
    if (!nextClose) {
      break;
    }
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      cursor = nextOpen.index + nextOpen[0].length;
      continue;
    }
    depth -= 1;
    cursor = nextClose.index + closeTag.length;
    if (depth === 0) {
      const next = removeElementByClassAt(
        svgMarkup.slice(0, openMatch.index) + svgMarkup.slice(cursor),
        className,
        openMatch.index,
      );
      return { svg: next.svg, removed: true };
    }
  }

  return { svg: svgMarkup, removed: false };
}

function removeElementsByClass(svgMarkup: string, className: string): string {
  let svg = svgMarkup;
  let removed = true;
  while (removed) {
    const result = removeElementByClassAt(svg, className);
    svg = result.svg;
    removed = result.removed;
  }
  return svg;
}

function removeMindMapNodeControls(svgMarkup: string): string {
  return svgMarkup.replace(
    /<g\b(?=[^>]*\bclass="[^"]*\bsmm-node-add\b[^"]*")[^>]*(?:\/>|>[\s\S]*?<\/g>)/gi,
    (match: string) => (hasClassToken(match, "smm-node") ? match : ""),
  );
}

function removeMindMapExportFooter(svgMarkup: string): string {
  return svgMarkup
    .replace(
      /<foreignObject\b(?:(?!<\/foreignObject>)[\s\S])*\bclass="[^"]*\bfooter\b[^"]*"(?:(?!<\/foreignObject>)[\s\S])*<\/foreignObject>/gi,
      "",
    )
    .replace(/<style\b[^>]*>[\s\S]*?\.footer[\s\S]*?<\/style>/gi, "");
}

function removeAssociativeLineEditControls(svgMarkup: string): string {
  return svgMarkup.replace(
    /(<g\b[^>]*class="[^"]*\bsmm-associative-line-container\b[^"]*"[^>]*>)([\s\S]*?)(<\/g>)/gi,
    (_match, open: string, body: string, close: string) => {
      const cleaned = body
        .replace(/<line\b[^>]*(?:\/>|>[\s\S]*?<\/line>)/gi, "")
        .replace(/<circle\b[^>]*(?:\/>|>[\s\S]*?<\/circle>)/gi, "");
      return `${open}${cleaned}${close}`;
    },
  );
}

function removeMindMapEditOverlays(svgMarkup: string): string {
  let svg = removeElementsByClass(svgMarkup, "smm-hover-node");
  svg = removeMindMapNodeControls(svg);
  svg = removeElementsByClass(svg, "smm-quick-create-child-btn");
  // 保留 smm-expand-btn：收起子节点时节点后方的小圆球，与 Web 列表缩略图一致。
  svg = removeElementsByClass(svg, "smm-other-container");
  svg = removeElementsByClass(svg, "smm-outer-frame-container");
  svg = removeMindMapExportFooter(svg);
  svg = removeAssociativeLineEditControls(svg);
  return svg.replace(/\bclass="([^"]*)"/gi, (_match, value: string) => {
    const classNames = value
      .split(/\s+/)
      .filter(
        (item) => item && item !== "active" && item !== "smm-node-highlight",
      );
    return `class="${classNames.join(" ")}"`;
  });
}

/** Decode native iframe export (raw SVG or data:image/svg+xml URL) for list cards. */
export function decodeMindMapThumbnailPayload(payload: unknown): string | null {
  if (typeof payload !== "string" || !payload.trim()) {
    return null;
  }
  const decoded = decodeSvgDataUrl(payload.trim());
  if (!decoded.includes("<svg")) {
    return null;
  }
  return normalizeMindMapThumbnailSvg(decoded, { source: "native" });
}

export function normalizeMindMapThumbnailSvg(
  svgMarkup: string,
  opts?: { source?: "native" },
): string {
  svgMarkup = decodeSvgDataUrl(svgMarkup);
  const originalLength = svgMarkup.length;
  const originalViewBox = getSvgAttr(svgMarkup, "viewBox") || null;
  const originalSvgSize = {
    width: getSvgAttr(svgMarkup, "width") || null,
    height: getSvgAttr(svgMarkup, "height") || null,
  };
  const originalControlCounts = {
    hover: countMatches(svgMarkup, /\bsmm-hover-node\b/gi),
    quickCreate: countMatches(svgMarkup, /\bsmm-quick-create-child-btn\b/gi),
    expand: countMatches(svgMarkup, /\bsmm-expand-btn\b/gi),
    nodeAdd: countMatches(svgMarkup, /\bsmm-node-add\b/gi),
    otherContainer: countMatches(svgMarkup, /\bsmm-other-container\b/gi),
    footer: countMatches(svgMarkup, /\bclass="[^"]*\bfooter\b[^"]*"/gi),
  };
  let svg = sanitizeThumbnailSvg(svgMarkup)
    .replace(/^\uFEFF/, "")
    .trim();
  if (!/<svg\b/i.test(svg)) {
    return svg;
  }
  if (!/\sxmlns=/.test(getSvgOpenTag(svg))) {
    svg = setOrAddSvgAttr(svg, "xmlns", "http://www.w3.org/2000/svg");
  }
  if (!/\sviewBox=/.test(getSvgOpenTag(svg))) {
    svg = setOrAddSvgAttr(svg, "viewBox", deriveSvgViewBox(svg));
  }
  svg = normalizeMindMapTextNodes(svg);
  const isMindMapSvg = /class="smm-container"/.test(svg);
  if (isMindMapSvg) {
    svg = repairMindMapForeignObjectText(svg);
    svg = cropMindMapViewBox(svg);
  }
  const croppedViewBox = getSvgAttr(svg, "viewBox") || null;
  svg = removeMindMapEditOverlays(svg);
  if (isMindMapSvg) {
    debugMindMapThumbnail("normalize result", {
      originalLength,
      normalizedLength: svg.length,
      originalViewBox,
      croppedViewBox,
      finalViewBox: getSvgAttr(svg, "viewBox") || null,
      originalSvgSize,
      finalSvgSize: {
        width: getSvgAttr(svg, "width") || null,
        height: getSvgAttr(svg, "height") || null,
      },
      originalControlCounts,
      finalControlCounts: {
        hover: countMatches(svg, /\bsmm-hover-node\b/gi),
        quickCreate: countMatches(svg, /\bsmm-quick-create-child-btn\b/gi),
        expand: countMatches(svg, /\bsmm-expand-btn\b/gi),
        nodeAdd: countMatches(svg, /\bsmm-node-add\b/gi),
        otherContainer: countMatches(svg, /\bsmm-other-container\b/gi),
        footer: countMatches(svg, /\bclass="[^"]*\bfooter\b[^"]*"/gi),
      },
      svgOpenTag: getSvgOpenTag(svg).slice(0, 300),
    });
  }
  svg = setOrAddSvgAttr(
    svg,
    MINDMAP_THUMB_NORMALIZED_ATTR,
    MINDMAP_THUMB_NORMALIZED_VERSION,
  );
  if (opts?.source) {
    svg = markMindMapThumbnailSource(svg, opts.source);
  }
  return svg;
}

export function markMindMapThumbnailSource(
  svgMarkup: string,
  source: "native",
): string {
  if (!/<svg\b/i.test(svgMarkup)) {
    return svgMarkup;
  }
  let svg = setOrAddSvgAttr(
    svgMarkup,
    MINDMAP_THUMB_SOURCE_ATTR,
    `mindmap-${source}`,
  );
  svg = setOrAddSvgAttr(svg, "data-excal-filelist-thumb", "1");
  if (!/\bdata-excal-thumb-bg\s*=/i.test(svg)) {
    svg = setOrAddSvgAttr(svg, "data-excal-thumb-bg", "#ffffff");
  }
  return svg;
}

export function isNativeMindMapThumbnailSvg(
  svgMarkup: string | null | undefined,
): boolean {
  if (!svgMarkup) {
    return false;
  }
  const source = getSvgAttr(svgMarkup, MINDMAP_THUMB_SOURCE_ATTR);
  const legacySource = getSvgAttr(svgMarkup, LEGACY_MINDMAP_THUMB_SOURCE_ATTR);
  if (source === "mindmap-native" || legacySource === "native") {
    return true;
  }
  if (source === "mindmap-schematic" || legacySource === "schematic") {
    return false;
  }
  if (
    /\bdata-excal-filelist-thumb\s*=/i.test(svgMarkup) &&
    /class="[^"]*\bsmm-container\b[^"]*"/i.test(svgMarkup) &&
    /<rect\b[^>]*class="[^"]*\bsmm-node-shape\b/i.test(svgMarkup)
  ) {
    return false;
  }
  // native export 通常带 matrix 变换；示意缩略图用固定坐标
  return /transform="matrix\(/i.test(svgMarkup);
}

/** Session cache we can show before content hash is bound (native mindmap / excalidraw export). */
export function isTrustedWarmLocalThumbnailSvg(
  svgMarkup: string | null | undefined,
): boolean {
  if (!svgMarkup || !thumbnailSvgHasVisibleContent(svgMarkup)) {
    return false;
  }
  if (isNativeMindMapThumbnailSvg(svgMarkup)) {
    return true;
  }
  if (/class="[^"]*\bsmm-container\b[^"]*"/i.test(svgMarkup)) {
    return false;
  }
  return /\bdata-excal-filelist-thumb\s*=/i.test(svgMarkup);
}

export function withFileListThumbnailAttrs(
  svgMarkup: string,
  background: string,
): string {
  if (/\bdata-excal-filelist-thumb\s*=/i.test(svgMarkup)) {
    return svgMarkup;
  }
  return svgMarkup.replace(
    /<svg\b/i,
    `<svg data-excal-filelist-thumb="1" data-excal-thumb-bg="${escapeXmlAttr(
      background,
    )}" `,
  );
}

export function viewBackgroundFromSceneAppState(appState: unknown): string {
  if (!appState || typeof appState !== "object") {
    return "#ffffff";
  }
  const c = (appState as Record<string, unknown>).viewBackgroundColor;
  if (typeof c === "string" && c.trim()) {
    return c.trim();
  }
  return "#ffffff";
}

function expandThumbnailSvgToMinimumViewport(
  svgMarkup: string,
  minWidth: number,
  minHeight: number,
  background: string,
): string {
  const vbMatch = svgMarkup.match(/viewBox\s*=\s*"([^"]+)"/i);
  if (!vbMatch) {
    return svgMarkup;
  }
  const parts = vbMatch[1]
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (parts.length !== 4) {
    return svgMarkup;
  }
  const minX = Number(parts[0]);
  const minY = Number(parts[1]);
  const width = Number(parts[2]);
  const height = Number(parts[3]);
  if (
    ![minX, minY, width, height].every((value) => Number.isFinite(value)) ||
    width <= 0 ||
    height <= 0
  ) {
    return svgMarkup;
  }

  const expanded = expandRectToMinimumSize(
    { x: minX, y: minY, width, height },
    minWidth,
    minHeight,
  );
  const nextViewBox = `${expanded.x} ${expanded.y} ${expanded.width} ${expanded.height}`;
  let out = svgMarkup.replace(
    /viewBox\s*=\s*"[^"]*"/i,
    `viewBox="${nextViewBox}"`,
  );
  const openMatch = out.match(/<svg\b[^>]*>/i);
  if (!openMatch || openMatch.index === undefined) {
    return out;
  }
  const endOpen = openMatch.index + openMatch[0].length;
  const rect = `<rect x="${expanded.x}" y="${expanded.y}" width="${
    expanded.width
  }" height="${expanded.height}" fill="${escapeXmlAttr(background)}"/>`;
  return out.slice(0, endOpen) + rect + out.slice(endOpen);
}

export async function buildSceneThumbnailSvg(scene: {
  elements: unknown;
  appState: unknown;
  files: unknown;
}): Promise<string> {
  const { exportToSvg } = await import("@excalidraw/excalidraw");
  const svg = await exportToSvg({
    elements: scene.elements as any,
    appState: appStateForThumbnailExport(scene.appState as any),
    files: scene.files as any,
    exportPadding: FILE_LIST_THUMB_EXPORT_PADDING,
  });
  const bg = viewBackgroundFromSceneAppState(scene.appState);
  let html = sanitizeThumbnailSvg(svg.outerHTML);
  if (Array.isArray(scene.elements) && scene.elements.length > 0) {
    html = expandThumbnailSvgToMinimumViewport(
      html,
      FILE_LIST_THUMB_MIN_VIEWPORT_WIDTH,
      FILE_LIST_THUMB_MIN_VIEWPORT_HEIGHT,
      bg,
    );
  }
  if (!/\bdata-excal-filelist-thumb\s*=/i.test(html)) {
    html = withFileListThumbnailAttrs(html, bg);
  }
  return html;
}

/**
 * 从缩略图 SVG 标记中提取画布背景色（用于卡片容器 background-color）。
 */
export function extractThumbBg(svgMarkup: string): string {
  return svgMarkup.match(/\bdata-excal-thumb-bg="([^"]*)"/i)?.[1] ?? "#ffffff";
}

export function thumbnailSvgHasVisibleContent(svgMarkup: string): boolean {
  const withoutDefs = svgMarkup.replace(/<defs\b[\s\S]*?<\/defs>/gi, "");
  if (
    /<(?:path|polygon|ellipse|circle|line|polyline|text|image)\b/i.test(
      withoutDefs,
    )
  ) {
    return true;
  }
  return [...withoutDefs.matchAll(/<rect\b/gi)].length > 1;
}

/**
 * 列表卡片内：保持 SVG 原始宽高比，以 xMidYMid meet 居中显示在 5/3 预览区内。
 * 留白区域由父容器背景色（与画布底色一致，见 extractThumbBg）填充，确保四周留白均等。
 * 父级 `overflow: hidden` + 圆角负责裁切。
 */
/*
 * 卡片缩略图规范化是纯函数，但单张 SVG 的正则规范化（normalizeMindMapThumbnailSvg
 * 含数十条 smm-* / foreignObject / @font-face 正则）成本不低。首页列表在启动 / 拖拽
 * 保存期间会多次重渲染，每次对同一张未变的缩略图重复规范化（冷启动 renderer profile
 * 实测 ~2s）。这里按输入字符串做有界 memo，相同输入直接命中缓存，避免重复正则。
 * 仅缓存有界条数，超出按插入顺序淘汰最旧项，防止内存无界增长。
 */
const CARD_SVG_CACHE_MAX = 256;
const cardSvgCache = new Map<string, string>();

export function patchThumbnailSvgForCard(svgMarkup: string): string {
  const cached = cardSvgCache.get(svgMarkup);
  if (cached !== undefined) {
    return cached;
  }
  const result = computePatchedThumbnailSvgForCard(svgMarkup);
  if (cardSvgCache.size >= CARD_SVG_CACHE_MAX) {
    const oldest = cardSvgCache.keys().next().value;
    if (oldest !== undefined) {
      cardSvgCache.delete(oldest);
    }
  }
  cardSvgCache.set(svgMarkup, result);
  return result;
}

function computePatchedThumbnailSvgForCard(svgMarkup: string): string {
  const normalized = isMindMapThumbnailSvg(svgMarkup)
    ? normalizeMindMapThumbnailSvg(
        svgMarkup,
        isNativeMindMapThumbnailSvg(svgMarkup) ? { source: "native" } : undefined,
      )
    : isMindMapThumbNormalized(svgMarkup)
      ? svgMarkup
      : normalizeMindMapThumbnailSvg(svgMarkup);
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
