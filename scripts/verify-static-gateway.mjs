#!/usr/bin/env node
/**
 * 检查 MindMap 静态资源在公网是否可正确返回（需登录态时用 COOKIE）。
 *
 * 主站设计：未带会话 cookie 时 302 → OAuth 是正常的，不应把 /mind-map/dist 加入公网白名单。
 * 仅 embed 的 hash 路径在应用层免登（/embed/mind-map/dist/*），本脚本不测 embed。
 *
 *   HOST=https://editorhub.example.com node scripts/verify-static-gateway.mjs
 *   HOST=… COOKIE='name=value; …' node scripts/verify-static-gateway.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findMindMapAppBundle } from "./mind-map-webpack-chunks.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const host = (process.env.HOST || process.argv[2] || "").replace(/\/$/, "");
const cookie = process.env.COOKIE || "";

if (!host) {
  console.error(
    "Usage: HOST=https://your.host [COOKIE='session=…'] node scripts/verify-static-gateway.mjs",
  );
  process.exit(2);
}

function fail(msg) {
  console.error(`[verify-static-gateway] FAIL: ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`[verify-static-gateway] OK: ${msg}`);
}

function pickSampleChunkUrl() {
  const distJs = path.join(repoRoot, "public/mind-map/dist/js");
  const appJs = findMindMapAppBundle(distJs);
  if (!appJs) {
    return null;
  }
  const source = fs.readFileSync(path.join(distJs, appJs), "utf8");
  const match = source.match(/["']js\/(chunk-[^"']+\.js)["']/);
  if (!match) {
    return `/mind-map/dist/js/${appJs}`;
  }
  return `/mind-map/dist/${match[1]}`;
}

async function probe(url) {
  const headers = cookie ? { Cookie: cookie } : {};
  const res = await fetch(url, { method: "HEAD", redirect: "manual", headers });
  const ct = res.headers.get("content-type") || "";
  const loc = res.headers.get("location") || "";
  return { status: res.status, contentType: ct, location: loc };
}

const mindMapPath = pickSampleChunkUrl();
if (!mindMapPath) {
  fail("local public/mind-map/dist/js not found — run yarn build:production first");
}

const url = `${host}${mindMapPath}`;

let result;
try {
  result = await probe(url);
} catch (e) {
  fail(`${url} — fetch error: ${e instanceof Error ? e.message : e}`);
}

const { status, contentType, location } = result;

if (!cookie) {
  if (status >= 300 && status < 400 && /oauth|login|account/i.test(location)) {
    ok(`unauthenticated → ${status} OAuth redirect (expected for main app)`);
    console.log(
      "[verify-static-gateway] Re-run with COOKIE from a logged-in browser to verify JS is served after login.",
    );
    process.exit(0);
  }
  console.warn(
    `[verify-static-gateway] Without COOKIE got ${status} (not OAuth redirect) — check gateway config`,
  );
}

if (status === 404) {
  fail(`${url} → 404 — deploy full public/mind-map/dist/js/ (all chunk-*.js)`);
}

if (status >= 300 && status < 400) {
  fail(
    `${url} → ${status} redirect to ${location || "(none)"}` +
      (cookie
        ? " — logged-in request still redirected; fix OAuth cookie Domain/Path or forward-auth pass-through"
        : " — pass COOKIE= from logged-in session to test authenticated static"),
  );
}

if (!/javascript|ecmascript|octet-stream/i.test(contentType)) {
  fail(
    `${url} → 200 but Content-Type: ${contentType} (expected JavaScript, got HTML/login page?)`,
  );
}

ok(`${url} → ${status} ${contentType.split(";")[0]}${cookie ? " (authenticated)" : ""}`);
