#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(desktopRoot, "../..");
const sourcePng512 = path.join(repoRoot, "public/maskable_icon_x512.png");
const buildDir = path.join(desktopRoot, "build");
const iconPng = path.join(buildDir, "icon.png");
const iconIco = path.join(buildDir, "icon.ico");

const ICO_PARTS = [
  path.join(repoRoot, "public/favicon-16x16.png"),
  path.join(repoRoot, "public/favicon-32x32.png"),
  path.join(repoRoot, "public/android-chrome-192x192.png"),
  sourcePng512,
];

function readPngSize(png) {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

function encodeIco(pngFiles) {
  const images = pngFiles.map((file) => {
    const png = fs.readFileSync(file);
    const { width, height } = readPngSize(png);
    const size = Math.max(width, height);
    return { size, png };
  });

  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const directories = [];
  const payloads = [];
  let offset = 6 + count * 16;

  for (const { size, png } of images) {
    const directory = Buffer.alloc(16);
    directory.writeUInt8(size >= 256 ? 0 : size, 0);
    directory.writeUInt8(size >= 256 ? 0 : size, 1);
    directory.writeUInt8(0, 2);
    directory.writeUInt8(0, 3);
    directory.writeUInt16LE(1, 4);
    directory.writeUInt16LE(32, 6);
    directory.writeUInt32LE(png.length, 8);
    directory.writeUInt32LE(offset, 12);
    directories.push(directory);
    payloads.push(png);
    offset += png.length;
  }

  return Buffer.concat([header, ...directories, ...payloads]);
}

if (!fs.existsSync(sourcePng512)) {
  throw new Error(`Missing web icon source: ${sourcePng512}`);
}

for (const part of ICO_PARTS) {
  if (!fs.existsSync(part)) {
    throw new Error(`Missing icon raster for desktop pack: ${part}`);
  }
}

fs.mkdirSync(buildDir, { recursive: true });
fs.copyFileSync(sourcePng512, iconPng);
fs.writeFileSync(iconIco, encodeIco(ICO_PARTS));

console.log(
  `[desktop-icon] synced ${[
    path.relative(repoRoot, iconPng),
    path.relative(repoRoot, iconIco),
  ].join(", ")} from public/maskable_icon_x512.png`,
);
