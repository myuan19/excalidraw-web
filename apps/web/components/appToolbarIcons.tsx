import { createIcon } from "@excalidraw/excalidraw/components/icons";

const tablerStroke = {
  width: 24,
  height: 24,
  fill: "none" as const,
  strokeWidth: 2,
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Home / 返回文件列表 */
export const smallHouseIcon = createIcon(
  <g strokeWidth={1.5}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M5 12l-2 0l9 -9l9 9l-2 0" />
    <path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6" />
    <path d="M10 12h4v9" />
  </g>,
  tablerStroke,
);

/** Save only / 保存 */
export const toolbarSaveIcon = createIcon(
  <g strokeWidth={1.5}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M6 4h10l4 4v10a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2" />
    <path d="M14 4v4h-8v-4" />
    <path d="M10 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
  </g>,
  tablerStroke,
);

/** Embed / 嵌入到网页 (Material "code" icon, fill-based) */
export const toolbarEmbedIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4z" />
  </svg>
);

/** Close / leave editor (local-only persistence) */
export const toolbarCloseDocIcon = createIcon(
  <g strokeWidth={1.5}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2" />
    <path d="M7 12h14l-3 -3m0 6l3 -3" />
  </g>,
  tablerStroke,
);
