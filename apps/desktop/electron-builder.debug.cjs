const pkg = require("./package.json");

module.exports = {
  ...pkg.build,
  // Debug 与正式包共用 appId 会共享 NSIS GUID；若 Debug 装过又删目录，
  // 正式安装器会先调失效的 Uninstall*.exe 并卡在 ~30%。Debug 用独立 appId。
  appId: "com.editorhub.desktop.debug",
  productName: "EditorHub Debug",
  // 本机杀毒会在 electron zip 解压后的 rename(win-unpacked.tmp → win-unpacked)
  // 瞬间锁目录导致 EPERM。EDITORHUB_ELECTRON_DIST 指向预解压的 electron 目录
  // 时跳过现场解压，绕开竞态（见 dist/desktop/electron-dist-cache）。
  ...(process.env.EDITORHUB_ELECTRON_DIST
    ? { electronDist: process.env.EDITORHUB_ELECTRON_DIST }
    : {}),
};
