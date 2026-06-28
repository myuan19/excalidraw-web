import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("SettingsPanel source contract", () => {
  it("hides checkpoint settings on desktop", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "SettingsPanel.tsx"),
      "utf8",
    );

    expect(source).toContain("showCheckpointSettings");
    expect(source).toContain("const isDesktop = isDesktopEditorHub()");
    expect(source).toContain("!isDesktop");
    expect(source).toContain("showCheckpointSettings &&");
  });

  it("shows a single auto-save setting with an idle do-not-trigger option", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "SettingsPanel.tsx"),
      "utf8",
    );

    expect(source).toContain("自动保存");
    expect(source).toContain("开启后离开编辑器时自动保存并退出，无需手动确认。");
    expect(source).toContain("不触发");
    expect(source).toContain("停止编辑后自动触发保存（需先开启自动保存）。");
    expect(source).not.toContain("可在下方单独关闭");
    expect(source).not.toContain("选择“不触发”时仅保留退出/切换保存");
    expect(source).not.toContain("切换后台时自动保存");
    expect(source).not.toContain("离开自动保存");
    expect(source).not.toContain("autoSaveOnBlur");
    expect(source).not.toContain("autoSaveOnExit");
  });

  it("keeps log access visible and only shows debug controls when startup debug is allowed", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "SettingsPanel.tsx"),
      "utf8",
    );

    expect(source).toContain("showDebugLoggingControl");
    expect(source).toContain("debugLoggingMode");
    expect(source).toContain("debugCapability.allowed");
    expect(source).toContain("打开日志");
    expect(source).toContain("打开本次启动日志。");
    expect(source).toContain("打开本次启动日志");
    expect(source).toContain("handleOpenLogs");
    expect(source).toContain('type="checkbox"');
    expect(source).toContain('? "basic"');
    expect(source).toContain("const showDebugLoggingControl = debugCapability.allowed");
    expect(source).not.toContain('appSettings.debugLoggingMode === "off"');
    expect(source).not.toContain("已打开日志位置");
    expect(source).not.toContain("服务端 debug 未启用");
    expect(source).not.toContain("settings-panel__section-desc--center");
    expect(source).not.toContain("DEBUG_LOGGING_MODE_OPTIONS.map");
    expect(source).not.toContain("AI 调试");
  });

  it("exposes desktop storage controls between auto-save and debug", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "SettingsPanel.tsx"),
      "utf8",
    );

    expect(source).toContain("应用数据目录");
    expect(source).toContain("handleOpenAppDataDirectory");
    expect(source).toContain("getAppDataDirectoryPath");
    expect(source).toContain("默认保存目录");
    expect(source).toContain("handleChooseDefaultDataDirectory");
    expect(source).toContain("handleOpenDefaultDataDirectory");
    expect(source).toContain("defaultDataDirectoryPath");
    expect(source).toContain("pickFolder");
    expect(source).toContain("openPath");
    expect(source).toContain("SettingsPathSetting");
    expect(source).toContain("settings-panel__path-toolbar");
    expect(source).toContain("settings-panel__path-btn");
    expect(source).toContain("settings-panel__option--path-setting");
    expect(source).toContain("settings-panel__path-block");
    expect(source).toContain("<h3>存储位置</h3>");
    expect(source.indexOf("<h3>存储位置</h3>")).toBeLessThan(
      source.indexOf("<h3>日志</h3>"),
    );
    expect(source).toContain('label: "打开"');
    expect(source).toContain('label: "更改"');
  });
});
