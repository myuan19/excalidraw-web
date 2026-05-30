import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function encodeDataUrl(svg, base64 = false) {
  if (base64) {
    return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function decodeSvgPayload(payload) {
  if (typeof payload !== "string" || !payload.trim()) {
    return null;
  }
  const trimmed = payload.trim();
  if (!trimmed.startsWith("data:image/svg+xml")) {
    return trimmed;
  }
  const commaIndex = trimmed.indexOf(",");
  if (commaIndex === -1) {
    return null;
  }
  const meta = trimmed.slice(0, commaIndex);
  const body = trimmed.slice(commaIndex + 1);
  return meta.includes(";base64")
    ? Buffer.from(body, "base64").toString("utf8")
    : decodeURIComponent(body);
}

function getSvgOpenTag(svg) {
  return svg.match(/<svg\b[^>]*>/i)?.[0] ?? "";
}

function getAttr(svg, name) {
  return getSvgOpenTag(svg).match(new RegExp(`\\s${name}="([^"]*)"`, "i"))?.[1] ?? "";
}

function setOrAddAttr(svg, name, value) {
  if (new RegExp(`\\s${name}=`, "i").test(getSvgOpenTag(svg))) {
    return svg.replace(new RegExp(`\\s${name}="[^"]*"`, "i"), ` ${name}="${value}"`);
  }
  return svg.replace(/<svg\b/i, `<svg ${name}="${value}"`);
}

function deriveViewBox(svg) {
  const viewBox = getAttr(svg, "viewBox");
  if (viewBox) {
    return viewBox;
  }
  const width = Number.parseFloat(getAttr(svg, "width"));
  const height = Number.parseFloat(getAttr(svg, "height"));
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
    return `0 0 ${width} ${height}`;
  }
  return "0 0 1 1";
}

function normalizeMindMapSvgForInlineCard(payload) {
  let svg = decodeSvgPayload(payload);
  if (!svg || !/<svg\b/i.test(svg)) {
    return null;
  }
  svg = svg.replace(/^\uFEFF/, "").trim();
  if (!/\sxmlns=/.test(getSvgOpenTag(svg))) {
    svg = setOrAddAttr(svg, "xmlns", "http://www.w3.org/2000/svg");
  }
  if (!/\sviewBox=/.test(getSvgOpenTag(svg))) {
    svg = setOrAddAttr(svg, "viewBox", deriveViewBox(svg));
  }
  svg = svg
    .replace(/\s+preserveAspectRatio="[^"]*"/i, "")
    .replace(/\s+width="[^"]*"/i, "")
    .replace(/\s+height="[^"]*"/i, "");
  return svg.replace(
    /<svg\b/i,
    '<svg preserveAspectRatio="xMidYMid meet" width="100%" height="100%"',
  );
}

const rawWithSizeOnly =
  '<svg width="240" height="120"><g><rect x="0" y="0" width="240" height="120" fill="#fff"/><text x="20" y="60">MindMap</text></g></svg>';
const rawWithViewBox =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -10 240 120"><g><rect x="-20" y="-10" width="240" height="120" fill="#fff"/></g></svg>';

const samples = [
  ["rawWithSizeOnly", rawWithSizeOnly],
  ["base64DataUrlWithSizeOnly", encodeDataUrl(rawWithSizeOnly, true)],
  ["utf8DataUrlWithViewBox", encodeDataUrl(rawWithViewBox, false)],
];

const checks = Object.fromEntries(
  samples.map(([name, payload]) => {
    const normalized = normalizeMindMapSvgForInlineCard(payload);
    return [
      name,
      {
        ok: !!normalized,
        hasSvg: !!normalized && /<svg\b/i.test(normalized),
        hasXmlns: !!normalized && /\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/i.test(normalized),
        hasViewBox: !!normalized && /\sviewBox="[^"]+"/i.test(normalized),
        usesCardSize: !!normalized && /\swidth="100%"/i.test(normalized) && /\sheight="100%"/i.test(normalized),
        preserveAspect: !!normalized && /\spreserveAspectRatio="xMidYMid meet"/i.test(normalized),
        preview: normalized?.slice(0, 220) ?? null,
      },
    ];
  }),
);

const pass = Object.values(checks).every(
  (x) => x.ok && x.hasSvg && x.hasXmlns && x.hasViewBox && x.usesCardSize && x.preserveAspect,
);

const result = {
  id: "P1-6",
  title: "MindMap SVG thumbnail normalization",
  conclusion: pass ? "PASS" : "FAIL",
  checks,
  recommendation:
    "Decode MindMap SVG data URLs into raw SVG, then normalize inline card SVG by ensuring xmlns, viewBox, width=100%, height=100%, and preserveAspectRatio=xMidYMid meet.",
};

writeFileSync(join(__dirname, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(`${result.id} ${result.conclusion}`);
