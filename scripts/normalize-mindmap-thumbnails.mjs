import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const filesRoot = join(process.cwd(), "server/data/files");

function decodeXmlTextEntities(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function escapeXmlText(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function richTextToPlainText(value) {
  return decodeXmlTextEntities(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function normalizeTextNodes(svg) {
  return svg.replace(
    /(<text\b[^>]*>)([\s\S]*?)(<\/text>)/gi,
    (_match, open, text, close) =>
      `${open}${escapeXmlText(richTextToPlainText(text))}${close}`,
  );
}

let scanned = 0;
let changed = 0;

for (const fileId of readdirSync(filesRoot)) {
  const currentPath = join(filesRoot, fileId, "current.excalidraw");
  const thumbnailPath = join(filesRoot, fileId, "thumbnail.svg");
  if (!existsSync(currentPath) || !existsSync(thumbnailPath)) {
    continue;
  }
  let isMindMap = false;
  try {
    isMindMap = JSON.parse(readFileSync(currentPath, "utf8")).kind === "mindmap";
  } catch {
    continue;
  }
  if (!isMindMap) {
    continue;
  }
  scanned++;
  const before = readFileSync(thumbnailPath, "utf8");
  const after = normalizeTextNodes(before);
  if (after !== before) {
    writeFileSync(thumbnailPath, after, "utf8");
    changed++;
  }
}

console.log(
  `normalize-mindmap-thumbnails scanned=${scanned} changed=${changed}`,
);
