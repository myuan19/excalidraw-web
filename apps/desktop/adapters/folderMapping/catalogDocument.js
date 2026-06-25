import { existsSync, rmSync, writeFileSync } from "fs";

import { hashJson } from "./sidecar.js";

function escapeXmlText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeMindMapData(parsed) {
  if (isRecord(parsed) && isRecord(parsed.root)) {
    return parsed;
  }
  if (isRecord(parsed?.data) && isRecord(parsed.data.root)) {
    return parsed.data;
  }
  return null;
}

function isMindMapDocument(parsed) {
  const data = normalizeMindMapData(parsed);
  return isRecord(data?.root);
}

function isExcalidrawDocument(parsed) {
  if (!isRecord(parsed)) {
    return false;
  }
  if (parsed.type === "excalidraw" && Array.isArray(parsed.elements)) {
    return true;
  }
  return Array.isArray(parsed.elements);
}

/**
 * @param {string} raw
 * @param {string} [pathKind]
 * @returns {{ ok: true, kind: string, data: unknown } | { ok: false, error: string, message: string }}
 */
export function validateCatalogDocument(raw, pathKind = "excalidraw") {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      ok: false,
      error: "invalid_json",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  if (isMindMapDocument(parsed)) {
    return {
      ok: true,
      kind: "mindmap",
      data: normalizeMindMapData(parsed),
    };
  }
  if (isExcalidrawDocument(parsed)) {
    return {
      ok: true,
      kind: "excalidraw",
      data: parsed,
    };
  }

  return {
    ok: false,
    error: "unrecognized_document",
    message: `Not a supported document (path kind=${pathKind})`,
  };
}

function withFileListThumbnailAttrs(svgMarkup, background = "#ffffff") {
  return svgMarkup.replace(
    /<svg\b/i,
    `<svg data-excal-filelist-thumb="1" data-excal-thumb-bg="${escapeXmlText(
      background,
    )}"`,
  );
}

export function buildExcalidrawCatalogThumbnail(data) {
  const elements = Array.isArray(data?.elements)
    ? data.elements.filter((element) => element && !element.isDeleted)
    : [];
  const background =
    (isRecord(data?.appState) &&
      typeof data.appState.viewBackgroundColor === "string" &&
      data.appState.viewBackgroundColor.trim()) ||
    "#ffffff";
  const viewWidth = 480;
  const viewHeight = 288;
  if (elements.length === 0) {
    return withFileListThumbnailAttrs(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${viewWidth}" height="${viewHeight}" viewBox="0 0 ${viewWidth} ${viewHeight}"><rect width="${viewWidth}" height="${viewHeight}" fill="${escapeXmlText(
        background,
      )}"/></svg>`,
      background,
    );
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const shapes = elements.slice(0, 80).map((element) => {
    const x = Number(element.x) || 0;
    const y = Number(element.y) || 0;
    const width = Math.max(1, Number(element.width) || 1);
    const height = Math.max(1, Number(element.height) || 1);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
    const fill =
      typeof element.backgroundColor === "string" &&
      element.backgroundColor !== "transparent"
        ? element.backgroundColor
        : "none";
    const stroke =
      typeof element.strokeColor === "string" ? element.strokeColor : "#111111";
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${escapeXmlText(
      fill,
    )}" stroke="${escapeXmlText(stroke)}" stroke-width="1"/>`;
  });
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = viewWidth;
    maxY = viewHeight;
  }
  const pad = 24;
  const viewBox = `${minX - pad} ${minY - pad} ${Math.max(
    viewWidth,
    maxX - minX + pad * 2,
  )} ${Math.max(viewHeight, maxY - minY + pad * 2)}`;
  return withFileListThumbnailAttrs(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${viewWidth}" height="${viewHeight}" viewBox="${viewBox}"><rect x="${
      minX - pad
    }" y="${minY - pad}" width="${Math.max(
      viewWidth,
      maxX - minX + pad * 2,
    )}" height="${Math.max(
      viewHeight,
      maxY - minY + pad * 2,
    )}" fill="${escapeXmlText(background)}"/>${shapes.join("")}</svg>`,
    background,
  );
}

export function buildCatalogThumbnailSvg(kind, data) {
  if (kind === "mindmap") {
    return null;
  }
  return buildExcalidrawCatalogThumbnail(data);
}

/**
 * 扫描后为 healthy 文件生成列表缩略图；损坏文件移除已有缩略图。
 * @param {{ files: Array<Record<string, unknown>> }} meta
 * @param {{ thumbnailPath: (id: string) => string, removeFileArtifacts?: (id: string) => void }} sidecar
 */
export function ensureCatalogThumbnails(meta, sidecar) {
  for (const file of meta.files ?? []) {
    const thumbPath = sidecar.thumbnailPath(file.id);
    if (file.health === "corrupt") {
      if (existsSync(thumbPath)) {
        rmSync(thumbPath, { force: true });
      }
      continue;
    }
    if (existsSync(thumbPath)) {
      continue;
    }
    if (file.origin === "external") {
      continue;
    }
    if (!file._parsed) {
      continue;
    }
    try {
      const svg = buildCatalogThumbnailSvg(file.kind, file._parsed);
      if (!svg) {
        continue;
      }
      writeFileSync(thumbPath, svg, "utf-8");
    } catch {
      file.health = "corrupt";
      file.parse_error = "thumbnail_generation_failed";
      if (existsSync(thumbPath)) {
        rmSync(thumbPath, { force: true });
      }
    }
  }
}

export function contentShaForFile(file) {
  if (file._parsed) {
    return hashJson(file._parsed);
  }
  return file.content_sha256 ?? null;
}
