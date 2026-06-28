#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Resvg } from "@resvg/resvg-js";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(desktopRoot, "../..");
const sourceSvg = path.join(repoRoot, "public/icons/drawing-space.svg");
const sourcePng = path.join(repoRoot, "public/icons/drawing-space.png");
const buildDir = path.join(desktopRoot, "build");
const iconPng = path.join(buildDir, "icon.png");
const iconSvg = path.join(buildDir, "icon.svg");

function readLegacyEmbeddedPng(svgSource) {
  const match = svgSource.match(
    /href="data:image\/png;base64,([A-Za-z0-9+/=]+)"/,
  );
  if (!match) {
    return null;
  }
  return Buffer.from(match[1], "base64");
}

function rasterizeSvg(svgSource) {
  const resvg = new Resvg(svgSource, {
    fitTo: { mode: "width", value: 512 },
  });
  return resvg.render().asPng();
}

function resolveIconPng(svgSource) {
  if (fs.existsSync(sourcePng)) {
    return fs.readFileSync(sourcePng);
  }
  const legacyEmbedded = readLegacyEmbeddedPng(svgSource);
  if (legacyEmbedded) {
    return legacyEmbedded;
  }
  return rasterizeSvg(svgSource);
}

if (!fs.existsSync(sourceSvg)) {
  throw new Error(`Missing web icon source: ${sourceSvg}`);
}

fs.mkdirSync(buildDir, { recursive: true });
const svgSource = fs.readFileSync(sourceSvg, "utf8");
fs.writeFileSync(iconSvg, svgSource);
fs.writeFileSync(iconPng, resolveIconPng(svgSource));

console.log(`[desktop-icon] synced ${path.relative(repoRoot, iconPng)}`);
