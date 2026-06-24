import { devDebug, isDevDebugChannelEnabled } from "../lib/devDebug";
import {
  computeMindMapFocusedViewBoxFromNodeBounds,
  formatMindMapViewBox,
  buildMindMapThumbnailFocusedViewBoxOptions,
} from "../editors/mindmap/mindMapFocusedViewBox.js";

import {
  FILE_LIST_THUMB_EXPORT_PADDING,
  FILE_LIST_THUMB_MIN_VIEWPORT_HEIGHT,
  FILE_LIST_THUMB_MIN_VIEWPORT_WIDTH,
} from "./thumbnailExport";
import { computeExcalidrawThumbnailSceneBounds } from "./thumbnailViewport";

export type { MindMapDocumentData } from "./formats/MindMapAdapter";

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
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function mindMapRichTextToPlainText(value: string): string {
  return decodeXmlTextEntities(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
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

function hasClassToken(markup: string, className: string): boolean {
  const classValue = markup.match(/\bclass="([^"]*)"/i)?.[1] ?? "";
  return classValue.split(/\s+/).includes(className);
}

const DEFAULT_MINDMAP_ROOT_SIZE = { width: 154, height: 45 };
const MINDMAP_THUMB_NORMALIZED_ATTR = "data-excal-mindmap-thumb-normalized";

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
    const shapeBounds = getMindMapNodeShapeBounds(nodeMarkup);
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
  shouldRemove: (elementMarkup: string) => boolean = () => true,
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
    if (!shouldRemove(openMatch[0])) {
      return removeElementByClassAt(svgMarkup, className, openEnd, shouldRemove);
    }
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
      const elementMarkup = svgMarkup.slice(openMatch.index, cursor);
      if (!shouldRemove(elementMarkup)) {
        return removeElementByClassAt(
          svgMarkup,
          className,
          cursor,
          shouldRemove,
        );
      }
      const next = removeElementByClassAt(
        svgMarkup.slice(0, openMatch.index) + svgMarkup.slice(cursor),
        className,
        openMatch.index,
        shouldRemove,
      );
      return { svg: next.svg, removed: true };
    }
  }

  return { svg: svgMarkup, removed: false };
}

function removeElementsByClass(
  svgMarkup: string,
  className: string,
  shouldRemove?: (elementMarkup: string) => boolean,
): string {
  let svg = svgMarkup;
  let removed = true;
  while (removed) {
    const result = removeElementByClassAt(svg, className, 0, shouldRemove);
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
  svg = removeElementsByClass(
    svg,
    "smm-expand-btn",
    (elementMarkup) => !/\bsmm-expand-btn-text\b/i.test(elementMarkup),
  );
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

export function normalizeMindMapThumbnailSvg(svgMarkup: string): string {
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
  svg = setOrAddSvgAttr(svg, MINDMAP_THUMB_NORMALIZED_ATTR, "1");
  return svg;
}

export type MindMapThumbnailSource = "native";

export function markMindMapThumbnailSource(
  svgMarkup: string,
  source: MindMapThumbnailSource,
): string {
  if (!/<svg\b/i.test(svgMarkup)) {
    return svgMarkup;
  }
  let svg = setOrAddSvgAttr(
    svgMarkup,
    "data-excal-thumb-source",
    `mindmap-${source}`,
  );
  svg = setOrAddSvgAttr(svg, "data-excal-filelist-thumb", "1");
  if (!/\bdata-excal-thumb-bg\s*=/i.test(svg)) {
    svg = setOrAddSvgAttr(svg, "data-excal-thumb-bg", "#ffffff");
  }
  return svg;
}

export function isSchematicMindMapThumbnailSvg(svgMarkup: string): boolean {
  if (/data-excal-thumb-source=["']mindmap-native["']/i.test(svgMarkup)) {
    return false;
  }
  if (/data-excal-thumb-source=["']mindmap-schematic["']/i.test(svgMarkup)) {
    return true;
  }
  if (!/class=["'][^"']*\bsmm-container\b/i.test(svgMarkup)) {
    return false;
  }
  return (
    /class=["'][^"']*\bsmm-node-shape\b/i.test(svgMarkup) &&
    !/<foreignObject\b/i.test(svgMarkup) &&
    !/<image\b/i.test(svgMarkup)
  );
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

type ThumbnailSceneElement = {
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  strokeWidth?: number;
  opacity?: number;
  text?: string;
  fontSize?: number;
  points?: Array<readonly [number, number]>;
  isDeleted?: boolean;
};

function isRenderableSceneElement(
  element: unknown,
): element is ThumbnailSceneElement {
  return (
    element !== null &&
    typeof element === "object" &&
    !(element as ThumbnailSceneElement).isDeleted &&
    typeof (element as ThumbnailSceneElement).type === "string"
  );
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function sceneFillColor(element: ThumbnailSceneElement): string {
  const color = element.backgroundColor?.trim();
  if (!color || color === "transparent") {
    return "none";
  }
  return color;
}

function sceneStrokeColor(element: ThumbnailSceneElement): string {
  const color = element.strokeColor?.trim();
  return color && color !== "transparent" ? color : "#1e1e1e";
}

function sceneOpacityAttr(element: ThumbnailSceneElement): string {
  const opacity = finiteNumber(element.opacity, 100);
  return opacity >= 100 ? "" : ` opacity="${clamp(opacity, 0, 100) / 100}"`;
}

function sceneTransformAttr(element: ThumbnailSceneElement): string {
  const angle = finiteNumber(element.angle);
  if (!angle) {
    return "";
  }
  const x = finiteNumber(element.x);
  const y = finiteNumber(element.y);
  const width = finiteNumber(element.width);
  const height = finiteNumber(element.height);
  const deg = (angle * 180) / Math.PI;
  return ` transform="rotate(${deg} ${x + width / 2} ${y + height / 2})"`;
}

function sceneShapeAttrs(element: ThumbnailSceneElement): string {
  const stroke = escapeXmlAttr(sceneStrokeColor(element));
  const fill = escapeXmlAttr(sceneFillColor(element));
  const strokeWidth = Math.max(1, finiteNumber(element.strokeWidth, 1.5));
  return ` fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${sceneOpacityAttr(
    element,
  )}${sceneTransformAttr(element)}`;
}

function renderLinearElement(element: ThumbnailSceneElement): string {
  const x = finiteNumber(element.x);
  const y = finiteNumber(element.y);
  const points =
    Array.isArray(element.points) && element.points.length > 0
      ? element.points
      : ([
          [0, 0],
          [finiteNumber(element.width), finiteNumber(element.height)],
        ] as Array<readonly [number, number]>);
  const d = points
    .map((point, index) => {
      const px = x + finiteNumber(point[0]);
      const py = y + finiteNumber(point[1]);
      return `${index === 0 ? "M" : "L"}${px} ${py}`;
    })
    .join("");
  const stroke = escapeXmlAttr(sceneStrokeColor(element));
  const strokeWidth = Math.max(1, finiteNumber(element.strokeWidth, 1.5));
  const markerEnd =
    element.type === "arrow" ? ' marker-end="url(#arrow-head)"' : "";
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${sceneOpacityAttr(
    element,
  )}${markerEnd}${sceneTransformAttr(element)}/>`;
}

function renderSceneElement(element: ThumbnailSceneElement): string {
  const x = finiteNumber(element.x);
  const y = finiteNumber(element.y);
  const width = Math.max(1, finiteNumber(element.width, 1));
  const height = Math.max(1, finiteNumber(element.height, 1));
  const attrs = sceneShapeAttrs(element);

  switch (element.type) {
    case "rectangle":
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${Math.min(
        12,
        width / 8,
        height / 8,
      )}"${attrs}/>`;
    case "diamond": {
      const points = `${x + width / 2},${y} ${x + width},${y + height / 2} ${
        x + width / 2
      },${y + height} ${x},${y + height / 2}`;
      return `<polygon points="${points}"${attrs}/>`;
    }
    case "ellipse":
      return `<ellipse cx="${x + width / 2}" cy="${y + height / 2}" rx="${
        width / 2
      }" ry="${height / 2}"${attrs}/>`;
    case "line":
    case "arrow":
    case "freedraw":
      return renderLinearElement(element);
    case "text": {
      const fontSize = Math.max(10, finiteNumber(element.fontSize, 20));
      const text = escapeXmlText(element.text ?? "");
      return `<text x="${x}" y="${y + fontSize}" fill="${escapeXmlAttr(
        sceneStrokeColor(element),
      )}" font-size="${fontSize}" font-family="Arial, sans-serif"${sceneOpacityAttr(
        element,
      )}${sceneTransformAttr(element)}>${text}</text>`;
    }
    case "image":
      return (
        `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" fill="#f1f5f9" stroke="#94a3b8" stroke-width="2"${sceneOpacityAttr(
          element,
        )}${sceneTransformAttr(element)}/>` +
        `<text x="${x + width / 2}" y="${
          y + height / 2
        }" text-anchor="middle" dominant-baseline="middle" fill="#64748b" font-size="16" font-family="Arial, sans-serif">IMG</text>`
      );
    default:
      return "";
  }
}

export async function buildSceneThumbnailSvg(scene: {
  elements: unknown;
  appState: unknown;
  files: unknown;
}): Promise<string> {
  const bg = viewBackgroundFromSceneAppState(scene.appState);
  const elements = Array.isArray(scene.elements)
    ? scene.elements.filter(isRenderableSceneElement)
    : [];
  if (elements.length === 0) {
    return withFileListThumbnailAttrs(
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" fill="${escapeXmlAttr(
        bg,
      )}"/></svg>`,
      bg,
    );
  }

  const bounds = computeExcalidrawThumbnailSceneBounds(elements as any, {
    exportPadding: FILE_LIST_THUMB_EXPORT_PADDING,
    minWidth: FILE_LIST_THUMB_MIN_VIEWPORT_WIDTH,
    minHeight: FILE_LIST_THUMB_MIN_VIEWPORT_HEIGHT,
  });
  const viewBox = bounds
    ? `${bounds[0]} ${bounds[1]} ${bounds[2] - bounds[0]} ${
        bounds[3] - bounds[1]
      }`
    : `0 0 ${FILE_LIST_THUMB_MIN_VIEWPORT_WIDTH} ${FILE_LIST_THUMB_MIN_VIEWPORT_HEIGHT}`;
  const [viewX, viewY, viewWidth, viewHeight] = viewBox
    .split(/\s+/)
    .map(Number);
  const backgroundRect =
    [viewX, viewY, viewWidth, viewHeight].every(Number.isFinite) &&
    viewWidth > 0 &&
    viewHeight > 0
      ? `<rect x="${viewX}" y="${viewY}" width="${viewWidth}" height="${viewHeight}" fill="${escapeXmlAttr(
          bg,
        )}"/>`
      : `<rect width="100%" height="100%" fill="${escapeXmlAttr(bg)}"/>`;
  const body = elements.map(renderSceneElement).join("");
  return withFileListThumbnailAttrs(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${FILE_LIST_THUMB_MIN_VIEWPORT_WIDTH}" height="${FILE_LIST_THUMB_MIN_VIEWPORT_HEIGHT}" viewBox="${viewBox}"><defs><marker id="arrow-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#1e1e1e"/></marker></defs>${backgroundRect}${body}</svg>`,
    bg,
  );
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
export function patchThumbnailSvgForCard(svgMarkup: string): string {
  const isMindMapSvg = /class="smm-container"/.test(svgMarkup);
  let withoutEmbeddedFonts =
    isMindMapSvg &&
    !new RegExp(`\\b${MINDMAP_THUMB_NORMALIZED_ATTR}\\s*=\\s*"1"`, "i").test(
      svgMarkup,
    )
      ? normalizeMindMapThumbnailSvg(svgMarkup)
      : sanitizeThumbnailSvg(svgMarkup);
  if (!getSvgAttr(withoutEmbeddedFonts, "viewBox")) {
    withoutEmbeddedFonts = setOrAddSvgAttr(
      withoutEmbeddedFonts,
      "viewBox",
      deriveSvgViewBox(withoutEmbeddedFonts),
    );
  }
  const patched = withoutEmbeddedFonts.replace(
    /(<svg\b)([^>]*)(>)/i,
    (_match, open: string, attrs: string, close: string) => {
      const cleaned = attrs
        .replace(/\s+preserveAspectRatio=(?:"[^"]*"|'[^']*'|[^\s>]*)/i, "")
        .replace(/\s+width=(?:"[^"]*"|'[^']*'|[^\s>]*)/i, "")
        .replace(/\s+height=(?:"[^"]*"|'[^']*'|[^\s>]*)/i, "");
      return `${open}${cleaned} preserveAspectRatio="xMidYMid meet" width="100%" height="100%"${close}`;
    },
  );
  if (/class="smm-container"/.test(withoutEmbeddedFonts)) {
    debugMindMapThumbnail("patch for card", {
      rawViewBox: getSvgAttr(svgMarkup, "viewBox") || null,
      normalizedViewBox: getSvgAttr(withoutEmbeddedFonts, "viewBox") || null,
      patchedViewBox: getSvgAttr(patched, "viewBox") || null,
      patchedPreserveAspectRatio:
        getSvgAttr(patched, "preserveAspectRatio") || null,
      patchedSvgSize: {
        width: getSvgAttr(patched, "width") || null,
        height: getSvgAttr(patched, "height") || null,
      },
      rawLen: svgMarkup.length,
      patchedLen: patched.length,
    });
  }
  return patched;
}
