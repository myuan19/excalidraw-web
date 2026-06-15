/**
 * 从 excalidraw v0.18.0 upstream 恢复被占位简化的组件源码。
 * 仅覆盖已知 stub 路径，不影响 packages 内其余自定义改动。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET_ROOT = path.join(ROOT, "packages/excalidraw");
const UPSTREAM_TAG = "v0.18.0";
const BASE_URL = `https://raw.githubusercontent.com/excalidraw/excalidraw/${UPSTREAM_TAG}/packages/excalidraw`;

const RELATIVE_PATHS = [
  "components/main-menu/MainMenu.tsx",
  "components/main-menu/DefaultItems.tsx",
  "components/main-menu/DefaultItems.scss",
  "components/welcome-screen/WelcomeScreen.tsx",
  "components/welcome-screen/WelcomeScreen.scss",
  "components/welcome-screen/WelcomeScreen.Center.tsx",
  "components/welcome-screen/WelcomeScreen.Hints.tsx",
  "components/dropdownMenu/DropdownMenu.tsx",
  "components/dropdownMenu/DropdownMenuItem.tsx",
  "components/dropdownMenu/DropdownMenuItemContent.tsx",
  "components/dropdownMenu/DropdownMenuItemCustom.tsx",
  "components/dropdownMenu/DropdownMenuItemLink.tsx",
  "components/dropdownMenu/DropdownMenuGroup.tsx",
  "components/dropdownMenu/DropdownMenuSeparator.tsx",
  "components/dropdownMenu/DropdownMenuTrigger.tsx",
  "components/dropdownMenu/common.ts",
  "components/Stats.tsx",
  "components/Stats/Angle.tsx",
  "components/Stats/CanvasGrid.tsx",
  "components/Stats/Collapsible.tsx",
  "components/Stats/Dimension.tsx",
  "components/Stats/DragInput.tsx",
  "components/Stats/FontSize.tsx",
  "components/Stats/MultiAngle.tsx",
  "components/Stats/MultiDimension.tsx",
  "components/Stats/MultiFontSize.tsx",
  "components/Stats/MultiPosition.tsx",
  "components/Stats/Position.tsx",
  "components/Stats/Stats.scss",
  "components/Stats/index.tsx",
  "components/Stats/utils.ts",
  "components/CommandPalette/CommandPalette.tsx",
  "components/CommandPalette/CommandPalette.scss",
  "components/CommandPalette/types.ts",
  "components/CommandPalette/defaultCommandPaletteItems.ts",
  "components/hyperlink/Hyperlink.tsx",
  "components/hyperlink/Hyperlink.scss",
  "components/FollowMode/FollowMode.tsx",
  "components/TTDDialog/TTDDialog.tsx",
  "components/TTDDialog/TTDDialog.scss",
  "components/TTDDialog/TTDDialogTrigger.tsx",
  "components/TTDDialog/TTDDialogInput.tsx",
  "components/TTDDialog/TTDDialogOutput.tsx",
  "components/TTDDialog/TTDDialogPanel.tsx",
  "components/TTDDialog/TTDDialogPanels.tsx",
  "components/TTDDialog/TTDDialogSubmit.tsx",
  "components/TTDDialog/common.ts",
  "components/TTDDialog/MermaidToExcalidraw.tsx",
  "components/TTDDialog/utils/TTDStreamFetch.ts",
  "components/DiagramToCodePlugin/DiagramToCodePlugin.tsx",
  "components/live-collaboration/LiveCollaborationTrigger.tsx",
  "components/OverwriteConfirm/OverwriteConfirm.tsx",
  "components/OverwriteConfirm/OverwriteConfirm.scss",
  "components/ColorPicker/ColorPicker.tsx",
  "components/ColorPicker/ColorPicker.scss",
  "components/ColorPicker/colorPickerUtils.ts",
  "components/ColorPicker/Picker.tsx",
  "components/ColorPicker/PickerColorList.tsx",
  "components/ColorPicker/PickerHeading.tsx",
  "components/ColorPicker/ShadeList.tsx",
  "components/ColorPicker/TopPicks.tsx",
  "components/FontPicker/FontPicker.tsx",
  "components/FontPicker/FontPicker.scss",
  "components/FontPicker/FontPickerList.tsx",
  "components/FontPicker/FontPickerTrigger.tsx",
];

async function fetchUpstream(relativePath) {
  const url = `${BASE_URL}/${relativePath.replace(/\\/g, "/")}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  return response.text();
}

let restored = 0;
let skipped = 0;
const failures = [];

for (const relativePath of RELATIVE_PATHS) {
  const targetPath = path.join(TARGET_ROOT, relativePath);
  try {
    const content = await fetchUpstream(relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content, "utf8");
    restored += 1;
    console.log(`restored ${relativePath}`);
  } catch (error) {
    skipped += 1;
    failures.push({ relativePath, message: error instanceof Error ? error.message : String(error) });
    console.warn(`skip ${relativePath}: ${error instanceof Error ? error.message : error}`);
  }
}

console.log(`\nDone. restored=${restored} skipped=${skipped}`);
if (failures.length) {
  console.log("Failures:");
  for (const failure of failures) {
    console.log(`- ${failure.relativePath}: ${failure.message}`);
  }
  process.exitCode = failures.length > 0 && restored === 0 ? 1 : 0;
}
