#!/usr/bin/env node
/**
 * Fail fast when EditorHub desktop binaries are still running and would lock
 * electron-builder portable output on Windows.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(repoRoot, "dist", "desktop");

// Windows 的 tasklist/powershell 偶发在杀软扫描或进程枚举卡顿时长时间不返回，
// 会把这个「打包前占用预检」拖成整包 hang。给子进程调用加硬超时：超时即当作
// 「查不到占用」放行（execSync 超时会抛错，被 catch 兜底返回 []），预检永不阻断打包。
const PROBE_TIMEOUT_MS = 8000;

function listWindowsEditorHubProcesses() {
  if (process.platform !== "win32") {
    return [];
  }
  try {
    const output = execSync(
      'tasklist /FI "IMAGENAME eq EditorHub.exe" /FO CSV /NH & tasklist /FI "IMAGENAME eq EditorHub Debug.exe" /FO CSV /NH',
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        shell: true,
        timeout: PROBE_TIMEOUT_MS,
        windowsHide: true,
      },
    );
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^"[^"]+\.exe"/i.test(line));
  } catch {
    return [];
  }
}

function listPortableMatches() {
  if (!existsSync(distDir)) {
    return [];
  }
  try {
    const output = execSync(
      `powershell -NoProfile -Command "Get-Process -Name 'EditorHub*' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path"`,
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: PROBE_TIMEOUT_MS,
        windowsHide: true,
      },
    );
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

const running = listPortableMatches();
const tasklist = listWindowsEditorHubProcesses();

if (running.length === 0 && tasklist.length === 0) {
  console.log("[ensure-desktop-pack-unlocked] ok");
  process.exit(0);
}

console.error("[ensure-desktop-pack-unlocked] EditorHub is still running.");
if (running.length > 0) {
  console.error("Running paths:");
  for (const entry of running) {
    console.error(`  - ${entry}`);
  }
}
console.error("");
console.error("Close all EditorHub windows before rebuilding portable exe:");
console.error('  taskkill /IM "EditorHub.exe" /F');
console.error('  taskkill /IM "EditorHub 0.0.0.exe" /F');
console.error('  taskkill /IM "EditorHub Debug.exe" /F');
console.error('  taskkill /IM "EditorHub Debug 0.0.0.exe" /F');
console.error("");
console.error(
  "Note: NSIS installer may already be built at dist/desktop/EditorHub Setup *.exe",
);
process.exit(1);
