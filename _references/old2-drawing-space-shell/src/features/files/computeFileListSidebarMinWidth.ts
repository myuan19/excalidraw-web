import type { ServerFile, ServerFolder } from "@/types/file";

const ROW_CHROME_PX = 108;
const DEPTH_INDENT_PX = 12;
const SIDE_PADDING_PX = 16;
const MIN_FALLBACK_PX = 176;
const MAX_MIN_PX = 420;

let measureCanvas: HTMLCanvasElement | null = null;

function measureTextPx(text: string, font = "14px Inter, ui-sans-serif, system-ui, sans-serif"): number {
  if (typeof document === "undefined") {
    return text.length * 8;
  }
  if (!measureCanvas) {
    measureCanvas = document.createElement("canvas");
  }
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return text.length * 8;
  ctx.font = font;
  return ctx.measureText(text).width;
}

function collectFolderLabels(
  folders: ServerFolder[],
  parentId: string | null,
  depth: number,
  out: Array<{ text: string; depth: number }>,
) {
  const children = folders
    .filter((f) => f.parent_id === parentId)
    .sort((a, b) => a.sort_index - b.sort_index);
  for (const folder of children) {
    out.push({ text: folder.name, depth });
    collectFolderLabels(folders, folder.id, depth + 1, out);
  }
}

/**
 * 侧栏最小宽度 = 树行中最长内容（文件夹名 + 层级缩进 + 行内控件占位）+ 内边距。
 */
export function computeFileListSidebarMinWidth(
  folders: ServerFolder[],
  files: ServerFile[] = [],
): number {
  const labels: Array<{ text: string; depth: number }> = [
    { text: "全部文件", depth: 0 },
    { text: "新建文件夹", depth: 0 },
  ];
  collectFolderLabels(folders, null, 0, labels);

  for (const file of files) {
    labels.push({ text: file.name, depth: 0 });
  }

  let contentMax = 0;
  for (const { text, depth } of labels) {
    const rowWidth = ROW_CHROME_PX + depth * DEPTH_INDENT_PX + measureTextPx(text);
    contentMax = Math.max(contentMax, rowWidth);
  }

  return Math.min(MAX_MIN_PX, Math.max(MIN_FALLBACK_PX, Math.ceil(contentMax + SIDE_PADDING_PX)));
}
