import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import {
  getActiveDocumentFileId,
  resolveRecentFlyoutFileRecord,
  resolveRecentFlyoutItems,
  type RecentFlyoutItem,
} from "../data/recentFlyoutItems";
import {
  mergeFileCardThumbDisplay,
  type FileCardThumbDisplay,
} from "../data/fileCardThumbDisplay";
import { resolveFileCardThumbnailSvg } from "../data/resolveFileCardThumbnail";
import { extractThumbBg } from "../data/thumbnailSvg";
import { FileCardThumb } from "./FileCardThumb";
import { getFileIdFromHash } from "../data/fileIdFromHash";
import { isLocalDraftFileId } from "../data/localDraftFileId";
import {
  LocalThumbnailCache,
  LOCAL_THUMB_UPDATED_EVENT,
} from "../data/localThumbnailCache";
import {
  LocalDraftSessions,
  draftSessionToServerFile,
} from "../data/localDraftSessions";
import { readFileListTreeCache } from "../data/fileListSessionCache";
import { RECENT_FILES_CHANGE_EVENT } from "../data/recentFiles";
import {
  ServerSync,
  type ServerFile,
  type ServerFolder,
} from "../data/ServerSync";
import { useFileDraftStatus } from "../hooks/useFileDraftStatus";
import {
  editorIconForKind,
  getDocumentKindFromHash,
} from "../lib/appBranding";
import { dispatchAppShellNavigate } from "../shell/appShellNavigate";
import type { AppView } from "../shell/useAppView";

import "./EditorPlatformSidebar.scss";
import "./FileList.scss";

/** 预览浮层：固定全屏、不参与文档流，避免缩略图引发布局/滚动条抖动 */
const BRIDGE_PREVIEW_LAYER_ID = "editor-hub-bridge-preview-layer";

function ensureBridgePreviewLayer(): HTMLElement {
  const existing = document.getElementById(BRIDGE_PREVIEW_LAYER_ID);
  if (existing) {
    return existing;
  }
  const layer = document.createElement("div");
  layer.id = BRIDGE_PREVIEW_LAYER_ID;
  layer.className = "editor-bridge-preview-layer";
  document.body.appendChild(layer);
  return layer;
}

const BALL_SIZE = 52;
const EDGE_INSET = 10;
const PEEK_VISIBLE = 14;
const DOCK_HIDE = BALL_SIZE - PEEK_VISIBLE;
const DRAG_THRESHOLD_PX = 6;
const PANEL_GAP = 6;
/** 面板展开时，小球沿边缘方向再退后一点，避免与卡片贴太紧 */
const BALL_PANEL_SEPARATION = 4;
/** 竖向分组：保存/嵌入/历史 | 最近/文件 | 导入/导出 | 信息 */
const PANEL_BASE_HEIGHT = 390;
/** 最近飞出栏最多展示条数；不足时不补足空位 */
const RECENT_PANEL_MAX = 6;
const PANEL_WIDTH = 72;
/** 主面板内「最近」按钮距顶部的估算偏移，用于对齐飞出侧栏 */
const ACTION_ROW_HEIGHT = 48;
const PANEL_DIVIDER_BLOCK = 11;
const ACTIONS_BEFORE_RECENT = 3;
const DIVIDERS_BEFORE_RECENT = 1;
/** 与 .editor-bridge__recent-preview-portal 的 width + gap 一致（px，16px 根字号） */
const RECENT_PREVIEW_WIDTH_PX = 168;
const RECENT_PREVIEW_GAP_PX = 6;
const RECENT_FLYOUT_ROW_OFFSET =
  ACTIONS_BEFORE_RECENT * ACTION_ROW_HEIGHT +
  DIVIDERS_BEFORE_RECENT * PANEL_DIVIDER_BLOCK;
const ANCHOR_STORAGE_KEY = "excalidraw-editor-bridge-anchor-v2";

/** 沿边缘可移动区域：十等分，顶 1 + 中 6（拖拽）+ 底 1 */
const TRAVEL_BAND_TOP = 1;
const TRAVEL_BAND_DRAG = 6;
const TRAVEL_BAND_BOTTOM = 1;
const TRAVEL_BAND_COUNT =
  TRAVEL_BAND_TOP + TRAVEL_BAND_DRAG + TRAVEL_BAND_BOTTOM;

type SnapEdge = "left" | "right" | "top" | "bottom";
type ActionIcon =
  | "save"
  | "export"
  | "import"
  | "info"
  | "embed"
  | "history"
  | "files"
  | "recent";

type AnchorPosition = {
  edge: SnapEdge;
  /** 0–1 position along the edge (vertical for left/right, horizontal for top/bottom) */
  ratio: number;
};

const DEFAULT_ANCHOR: AnchorPosition = { edge: "left", ratio: 0.38 };

const ACTION_ICONS: Record<ActionIcon, string> = {
  save:
    "M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z",
  embed:
    "M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4z",
  history:
    "M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z",
  files:
    "M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z",
  recent:
    "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z",
  import:
    "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z",
  export:
    "M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z",
  info:
    "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z",
};

function clampRatio(ratio: number): number {
  return Math.max(0, Math.min(1, ratio));
}

function isVerticalEdge(edge: SnapEdge): boolean {
  return edge === "left" || edge === "right";
}

/** 小球沿左/右（竖向）或上/下（横向）边缘可拖拽的 [min, max]（小球左上角坐标）。 */
function getEdgeTravelBounds(
  edge: SnapEdge,
  viewport: { width: number; height: number },
): { min: number; max: number } {
  const axisSize = isVerticalEdge(edge) ? viewport.height : viewport.width;
  const topReserve = (TRAVEL_BAND_TOP / TRAVEL_BAND_COUNT) * axisSize;
  const dragSpan = (TRAVEL_BAND_DRAG / TRAVEL_BAND_COUNT) * axisSize;
  return {
    min: topReserve,
    max: topReserve + dragSpan - BALL_SIZE,
  };
}

function travelRatioToBallCoord(
  ratio: number,
  edge: SnapEdge,
  viewport: { width: number; height: number },
): number {
  const { min, max } = getEdgeTravelBounds(edge, viewport);
  const span = max - min;
  if (span <= 0) {
    return min;
  }
  return min + clampRatio(ratio) * span;
}

function ballCoordToTravelRatio(
  coord: number,
  edge: SnapEdge,
  viewport: { width: number; height: number },
): number {
  const { min, max } = getEdgeTravelBounds(edge, viewport);
  const span = max - min;
  if (span <= 0) {
    return 0.5;
  }
  return clampRatio((coord - min) / span);
}

function readStoredAnchor(): AnchorPosition {
  try {
    const raw = localStorage.getItem(ANCHOR_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_ANCHOR;
    }
    const parsed = JSON.parse(raw) as AnchorPosition;
    if (
      parsed &&
      (parsed.edge === "left" ||
        parsed.edge === "right" ||
        parsed.edge === "top" ||
        parsed.edge === "bottom") &&
      typeof parsed.ratio === "number"
    ) {
      return { edge: parsed.edge, ratio: clampRatio(parsed.ratio) };
    }
  } catch {
    // ignore
  }
  return DEFAULT_ANCHOR;
}

function writeStoredAnchor(anchor: AnchorPosition): void {
  try {
    localStorage.setItem(ANCHOR_STORAGE_KEY, JSON.stringify(anchor));
  } catch {
    // ignore
  }
}

function getViewportSize() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function snapToEdge(
  centerX: number,
  centerY: number,
  viewport: { width: number; height: number },
): AnchorPosition {
  const distLeft = centerX;
  const distRight = viewport.width - centerX;
  const distTop = centerY;
  const distBottom = viewport.height - centerY;
  const min = Math.min(distLeft, distRight, distTop, distBottom);

  const ballY = centerY - BALL_SIZE / 2;
  const ballX = centerX - BALL_SIZE / 2;

  if (min === distLeft) {
    return { edge: "left", ratio: ballCoordToTravelRatio(ballY, "left", viewport) };
  }
  if (min === distRight) {
    return { edge: "right", ratio: ballCoordToTravelRatio(ballY, "right", viewport) };
  }
  if (min === distTop) {
    return { edge: "top", ratio: ballCoordToTravelRatio(ballX, "top", viewport) };
  }
  return {
    edge: "bottom",
    ratio: ballCoordToTravelRatio(ballX, "bottom", viewport),
  };
}

function anchorToPoint(
  anchor: AnchorPosition,
  viewport: { width: number; height: number },
): { x: number; y: number } {
  const ratio = clampRatio(anchor.ratio);
  switch (anchor.edge) {
    case "left":
      return {
        x: EDGE_INSET,
        y: travelRatioToBallCoord(ratio, "left", viewport),
      };
    case "right":
      return {
        x: viewport.width - BALL_SIZE - EDGE_INSET,
        y: travelRatioToBallCoord(ratio, "right", viewport),
      };
    case "top":
      return {
        x: travelRatioToBallCoord(ratio, "top", viewport),
        y: EDGE_INSET,
      };
    case "bottom":
      return {
        x: travelRatioToBallCoord(ratio, "bottom", viewport),
        y: viewport.height - BALL_SIZE - EDGE_INSET,
      };
  }
}

function clampDragPoint(
  x: number,
  y: number,
  viewport: { width: number; height: number },
): { x: number; y: number } {
  return {
    x: Math.max(EDGE_INSET, Math.min(viewport.width - BALL_SIZE - EDGE_INSET, x)),
    y: Math.max(EDGE_INSET, Math.min(viewport.height - BALL_SIZE - EDGE_INSET, y)),
  };
}

function clampPanelOffset(
  offset: number,
  panelSize: number,
  ballStart: number,
  viewportSize: number,
  margin = 8,
): number {
  const absStart = ballStart + offset;
  if (absStart < margin) {
    return margin - ballStart;
  }
  if (absStart + panelSize > viewportSize - margin) {
    return viewportSize - margin - panelSize - ballStart;
  }
  return offset;
}

function edgeTravelRatio(
  anchor: AnchorPosition,
  displayPoint: { x: number; y: number },
  viewport: { width: number; height: number },
): number {
  if (isVerticalEdge(anchor.edge)) {
    return ballCoordToTravelRatio(displayPoint.y, anchor.edge, viewport);
  }
  return ballCoordToTravelRatio(displayPoint.x, anchor.edge, viewport);
}

/** 0 = 卡片顶与小球顶对齐；1 = 卡片底与小球底对齐（行程内均匀映射） */
function panelOffsetAlongBall(
  travelRatio: number,
  ballSize: number,
  panelSize: number,
): number {
  return clampRatio(travelRatio) * (ballSize - panelSize);
}

/** 操作菜单整体（主栏 + 最近飞出栏）相对悬浮球的定位 */
function computeMenuStyle(
  anchor: AnchorPosition,
  displayPoint: { x: number; y: number },
  viewport: { width: number; height: number },
): CSSProperties {
  if (anchor.edge === "left" || anchor.edge === "right") {
    const travelRatio = edgeTravelRatio(anchor, displayPoint, viewport);
    const rawTop = panelOffsetAlongBall(
      travelRatio,
      BALL_SIZE,
      PANEL_BASE_HEIGHT,
    );
    const top = Math.round(
      clampPanelOffset(
        rawTop,
        PANEL_BASE_HEIGHT,
        displayPoint.y,
        viewport.height,
      ),
    );

    if (anchor.edge === "left") {
      return {
        left: `calc(100% + ${PANEL_GAP}px)`,
        top,
        transform: "none",
      };
    }
    return {
      right: `calc(100% + ${PANEL_GAP}px)`,
      top,
      transform: "none",
    };
  }

  const left = Math.round(
    clampPanelOffset(
      (BALL_SIZE - PANEL_WIDTH) / 2,
      PANEL_WIDTH,
      displayPoint.x,
      viewport.width,
    ),
  );

  if (anchor.edge === "top") {
    return {
      top: `calc(100% + ${PANEL_GAP}px)`,
      left,
      transform: "none",
    };
  }
  return {
    bottom: `calc(100% + ${PANEL_GAP}px)`,
    left,
    transform: "none",
  };
}

function SidebarGlyph({ type }: { type: ActionIcon }) {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden>
      <path fill="currentColor" d={ACTION_ICONS[type]} />
    </svg>
  );
}

function dispatchHostSave() {
  window.dispatchEvent(new Event("excalidraw-host-request-save"));
  window.dispatchEvent(new Event("mindmap-host-request-save"));
}

function dispatchHostExport() {
  window.dispatchEvent(new Event("excalidraw-host-open-export"));
  window.dispatchEvent(new Event("mindmap-host-open-export"));
}

function dispatchHostImport() {
  window.dispatchEvent(new Event("excalidraw-host-open-import"));
  window.dispatchEvent(new Event("mindmap-host-open-import"));
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  const tag = el?.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    el?.isContentEditable === true
  );
}

function dispatchHostHistory() {
  window.dispatchEvent(new Event("excalidraw-host-open-history"));
  window.dispatchEvent(new Event("mindmap-host-open-history"));
}

function dispatchHostEmbed() {
  window.dispatchEvent(new Event("excalidraw-host-open-embed"));
  window.dispatchEvent(new Event("mindmap-host-open-embed"));
}

function dispatchShellNavigate(target: Exclude<AppView, "editor">) {
  dispatchAppShellNavigate({ target });
}

function SidebarDivider() {
  return <div className="editor-bridge__divider" role="separator" />;
}

type RecentRowHover = {
  item: RecentFlyoutItem;
  centerY: number;
  edgeX: number;
};

function RecentFlyoutRow({
  item,
  onSelect,
  onRowHover,
}: {
  item: RecentFlyoutItem;
  onSelect(item: RecentFlyoutItem): void;
  onRowHover(item: RecentFlyoutItem, row: HTMLLIElement | null): void;
}) {
  return (
    <li
      className="editor-bridge__recent-flyout-row"
      onMouseEnter={(event) => onRowHover(item, event.currentTarget)}
      onMouseLeave={() => onRowHover(item, null)}
    >
      <button
        type="button"
        className="editor-bridge__recent-flyout-item"
        title={item.name}
        onClick={() => onSelect(item)}
      >
        <img
          className="editor-bridge__recent-flyout-icon"
          src={editorIconForKind(item.kind)}
          alt=""
          width={18}
          height={18}
          draggable={false}
        />
        <span className="editor-bridge__recent-flyout-name">{item.name}</span>
      </button>
    </li>
  );
}

function clampRecentPreviewLeft(
  rawLeft: number,
  viewportWidth = window.innerWidth,
): number {
  const margin = 8;
  return Math.max(
    margin,
    Math.min(rawLeft, viewportWidth - RECENT_PREVIEW_WIDTH_PX - margin),
  );
}

function SidebarRecentList({
  anchorEdge,
  excludeFileId,
  onSelect,
}: {
  anchorEdge: SnapEdge;
  /** 当前正在编辑的文档 id，从最近列表中屏蔽 */
  excludeFileId: string | null;
  onSelect(item: RecentFlyoutItem): void;
}) {
  const thumbSvgCacheRef = useRef<Record<string, string>>({});
  const hoverFileIdRef = useRef<string | null>(null);
  const [items, setItems] = useState(() =>
    resolveRecentFlyoutItems({
      limit: RECENT_PANEL_MAX,
      excludeFileId,
    }),
  );
  const [rowHover, setRowHover] = useState<RecentRowHover | null>(null);
  const [previewDisplay, setPreviewDisplay] =
    useState<FileCardThumbDisplay | null>(null);

  useEffect(() => {
    const refresh = () => {
      thumbSvgCacheRef.current = {};
      setItems(
        resolveRecentFlyoutItems({
          limit: RECENT_PANEL_MAX,
          excludeFileId,
        }),
      );
    };
    refresh();
    window.addEventListener("hashchange", refresh);
    window.addEventListener(RECENT_FILES_CHANGE_EVENT, refresh);
    window.addEventListener("excalidraw-file-list-refresh", refresh);
    window.addEventListener(LOCAL_THUMB_UPDATED_EVENT, refresh);
    window.addEventListener("excalidraw-file-sync-state", refresh);
    return () => {
      window.removeEventListener("hashchange", refresh);
      window.removeEventListener(RECENT_FILES_CHANGE_EVENT, refresh);
      window.removeEventListener("excalidraw-file-list-refresh", refresh);
      window.removeEventListener(LOCAL_THUMB_UPDATED_EVENT, refresh);
      window.removeEventListener("excalidraw-file-sync-state", refresh);
    };
  }, [excludeFileId]);

  const handleRowHover = useCallback(
    (item: RecentFlyoutItem, row: HTMLLIElement | null) => {
      if (!row) {
        if (hoverFileIdRef.current === item.id) {
          hoverFileIdRef.current = null;
          setRowHover(null);
          setPreviewDisplay(null);
        }
        return;
      }
      const rect = row.getBoundingClientRect();
      hoverFileIdRef.current = item.id;
      setRowHover({
        item,
        centerY: rect.top + rect.height / 2,
        edgeX: anchorEdge === "right" ? rect.left : rect.right,
      });

      const file = resolveRecentFlyoutFileRecord(item.id);
      if (!file) {
        setPreviewDisplay(null);
        return;
      }

      const cachedSvg = thumbSvgCacheRef.current[item.id];
      const display = mergeFileCardThumbDisplay(item.id, file, cachedSvg);
      setPreviewDisplay(display);

      const needsFetch =
        !display.cardThumbSvg &&
        item.hasThumbnail &&
        !isLocalDraftFileId(item.id);
      if (!needsFetch) {
        return;
      }

      void resolveFileCardThumbnailSvg(item.id, file).then((cardThumbSvg) => {
        if (hoverFileIdRef.current !== item.id) {
          return;
        }
        if (cardThumbSvg) {
          thumbSvgCacheRef.current[item.id] = cardThumbSvg;
        }
        setPreviewDisplay(
          mergeFileCardThumbDisplay(item.id, file, cardThumbSvg ?? undefined),
        );
      });
    },
    [anchorEdge],
  );

  const previewLeft =
    rowHover == null
      ? 0
      : clampRecentPreviewLeft(
          anchorEdge === "right"
            ? rowHover.edgeX - RECENT_PREVIEW_WIDTH_PX - RECENT_PREVIEW_GAP_PX
            : rowHover.edgeX + RECENT_PREVIEW_GAP_PX,
        );

  const showPreview = !!rowHover && !!previewDisplay;

  if (items.length === 0) {
    return (
      <p className="editor-bridge__recent-flyout-empty">暂无最近打开的文件</p>
    );
  }

  return (
    <>
      <ul className="editor-bridge__recent-flyout-list">
        {items.map((item) => (
          <RecentFlyoutRow
            key={item.id}
            item={item}
            onSelect={onSelect}
            onRowHover={handleRowHover}
          />
        ))}
      </ul>
      {showPreview && rowHover && previewDisplay
        ? createPortal(
            <div
              className="editor-bridge__recent-preview-portal"
              style={{
                top: Math.round(rowHover.centerY),
                left: Math.round(previewLeft),
              }}
              aria-hidden
            >
              <FileCardThumb
                className="editor-bridge__recent-preview-thumb"
                kind={previewDisplay.kind}
                cardThumbSvg={previewDisplay.cardThumbSvg}
                thumbLoading={previewDisplay.thumbLoading}
                badge={previewDisplay.badge}
                thumbBg={previewDisplay.thumbBg}
              />
            </div>,
            ensureBridgePreviewLayer(),
          )
        : null}
    </>
  );
}

function SidebarActionButton({
  label,
  icon,
  disabled,
  title,
  onClick,
}: {
  label: string;
  icon: ActionIcon;
  disabled?: boolean;
  title?: string;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      className="editor-bridge__action"
      title={title ?? label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <SidebarGlyph type={icon} />
      <span className="editor-bridge__action-label">{label}</span>
    </button>
  );
}

type FileInfo = {
  file: ServerFile;
  folders: ServerFolder[];
};

function getFileExtension(kind?: string): string {
  if (kind === "mindmap") {
    return "smm";
  }
  return "excalidraw";
}

function getKindLabel(kind?: string): string {
  if (kind === "mindmap") {
    return "MindMap";
  }
  return "Excalidraw";
}

function buildFolderPath(
  folderId: string | null | undefined,
  folders: ServerFolder[],
): string {
  if (!folderId) {
    return "所有文件";
  }
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
  const path: string[] = [];
  const seen = new Set<string>();
  let current: string | null | undefined = folderId;
  while (current && !seen.has(current)) {
    seen.add(current);
    const folder = foldersById.get(current);
    if (!folder) {
      return "未知文件夹";
    }
    path.unshift(folder.name);
    current = folder.parent_id;
  }
  return path.length > 0 ? path.join(" / ") : "所有文件";
}

function formatFileTime(value?: string): string {
  if (!value) {
    return "未知";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

async function loadFileInfo(fileId: string): Promise<FileInfo> {
  const cached = readFileListTreeCache();
  let folders = cached?.folders ?? [];
  let file: ServerFile | undefined =
    cached?.files.find((item) => item.id === fileId) ??
    (isLocalDraftFileId(fileId)
      ? (() => {
          const draft = LocalDraftSessions.get(fileId);
          return draft ? draftSessionToServerFile(draft) : undefined;
        })()
      : undefined);

  if (!file) {
    const tree = await ServerSync.listFileTree();
    folders = tree.folders;
    file =
      tree.files.find((item) => item.id === fileId) ??
      (isLocalDraftFileId(fileId)
        ? (() => {
            const draft = LocalDraftSessions.get(fileId);
            return draft ? draftSessionToServerFile(draft) : undefined;
          })()
        : undefined);
  }

  if (!file) {
    if (isLocalDraftFileId(fileId)) {
      throw new Error("临时文件信息不存在，可能已被放弃或清理");
    }
    file = await ServerSync.getFile(fileId);
  }

  return { file, folders };
}

function FileInfoDialog({
  fileId,
  open,
  onClose,
}: {
  fileId: string | null;
  open: boolean;
  onClose(): void;
}) {
  const [info, setInfo] = useState<FileInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !fileId) {
      return;
    }
    let disposed = false;
    setLoading(true);
    setError(null);
    setInfo(null);
    loadFileInfo(fileId)
      .then((nextInfo) => {
        if (!disposed) {
          setInfo(nextInfo);
        }
      })
      .catch((err: any) => {
        if (!disposed) {
          setError(err?.message || "文件信息加载失败");
        }
      })
      .finally(() => {
        if (!disposed) {
          setLoading(false);
        }
      });
    return () => {
      disposed = true;
    };
  }, [fileId, open]);

  if (!open) {
    return null;
  }

  const rows = info
    ? [
        ["名称", info.file.name || "未命名"],
        ["类型", getKindLabel(info.file.kind)],
        ["后缀名", `.${getFileExtension(info.file.kind)}`],
        ["所属文件夹", buildFolderPath(info.file.folder_id, info.folders)],
        ["创建时间", formatFileTime(info.file.created_at)],
        ["编辑时间", formatFileTime(info.file.updated_at)],
        ["文件 ID", info.file.id],
      ]
    : [];

  return (
    <div
      className="editor-file-info"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="editor-file-info__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-file-info-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="editor-file-info__header">
          <h3 id="editor-file-info-title">文件信息</h3>
          <button
            type="button"
            className="editor-file-info__close"
            aria-label="关闭文件信息"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {loading ? (
          <p className="editor-file-info__muted">正在加载文件信息...</p>
        ) : error ? (
          <p className="editor-file-info__error">{error}</p>
        ) : (
          <dl className="editor-file-info__list">
            {rows.map(([label, value]) => (
              <div className="editor-file-info__row" key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </div>
  );
}

export function EditorPlatformSidebar() {
  const [open, setOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [showFileInfo, setShowFileInfo] = useState(false);
  const [fileId, setFileId] = useState<string | null>(() => getFileIdFromHash());
  const [documentKind, setDocumentKind] = useState(() =>
    getDocumentKindFromHash(),
  );
  const [anchor, setAnchor] = useState<AnchorPosition>(() => readStoredAnchor());
  const [viewport, setViewport] = useState(getViewportSize);
  const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [dragging, setDragging] = useState(false);
  const { status: draftStatus, label: draftStatusLabel } =
    useFileDraftStatus(fileId);

  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  const settledPoint = useMemo(
    () => anchorToPoint(anchor, viewport),
    [anchor, viewport],
  );
  const displayX = dragPoint?.x ?? settledPoint.x;
  const displayY = dragPoint?.y ?? settledPoint.y;
  const displayPoint = useMemo(
    () => ({ x: displayX, y: displayY }),
    [displayX, displayY],
  );
  const docked = !dragging && !open;
  const menuStyle = useMemo(
    () => computeMenuStyle(anchor, displayPoint, viewport),
    [anchor, displayPoint, viewport],
  );

  const menuShellStyle = useMemo((): CSSProperties => {
    return {
      ...menuStyle,
      ["--ep-recent-flyout-offset" as string]: `${RECENT_FLYOUT_ROW_OFFSET}px`,
    };
  }, [menuStyle]);

  useEffect(() => {
    ensureBridgePreviewLayer();
  }, []);

  useEffect(() => {
    const syncFromHash = () => {
      setFileId(getFileIdFromHash());
      setDocumentKind(getDocumentKindFromHash());
    };
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  const ballIconSrc = editorIconForKind(documentKind);

  useEffect(() => {
    const onResize = () => setViewport(getViewportSize());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    writeStoredAnchor(anchor);
  }, [anchor]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key !== "s") {
        return;
      }
      if (isEditableTarget(event.target) || event.isComposing) {
        return;
      }
      if (!fileId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      dispatchHostSave();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [fileId]);

  useEffect(() => {
    if (!open) {
      setRecentOpen(false);
    }
  }, [open]);

  const closeSidebarPanel = useCallback(() => {
    setOpen(false);
    setRecentOpen(false);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (rootRef.current?.contains(target)) {
        return;
      }
      const previewLayer = document.getElementById(BRIDGE_PREVIEW_LAYER_ID);
      if (previewLayer?.contains(target)) {
        return;
      }
      if (
        target instanceof Element &&
        target.closest(".editor-bridge__dismiss-layer")
      ) {
        return;
      }
      closeSidebarPanel();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeSidebarPanel();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closeSidebarPanel, open]);

  const closeAndRun = useCallback((action: () => void) => {
    closeSidebarPanel();
    action();
  }, [closeSidebarPanel]);

  const openRecentFile = useCallback(
    (item: RecentFlyoutItem) => {
      const activeId = getActiveDocumentFileId();
      if (activeId && item.id === activeId) {
        return;
      }
      closeAndRun(() =>
        dispatchAppShellNavigate({
          openFile: { id: item.id, kind: item.kind },
        }),
      );
    },
    [closeAndRun],
  );

  const finishDrag = useCallback(
    (clientX: number, clientY: number) => {
      const nextAnchor = snapToEdge(clientX, clientY, viewport);
      setAnchor(nextAnchor);
      setDragPoint(null);
      setDragging(false);
      dragRef.current = null;
    },
    [viewport],
  );

  const onBallPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: displayPoint.x,
      originY: displayPoint.y,
      moved: false,
    };
  };

  const onBallPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
      drag.moved = true;
      setDragging(true);
      setOpen(false);
    }
    if (drag.moved) {
      setDragPoint(
        clampDragPoint(drag.originX + dx, drag.originY + dy, viewport),
      );
    }
  };

  const onBallPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.moved) {
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      const clamped = clampDragPoint(
        drag.originX + dx,
        drag.originY + dy,
        viewport,
      );
      finishDrag(clamped.x + BALL_SIZE / 2, clamped.y + BALL_SIZE / 2);
    } else {
      setOpen((value) => !value);
      dragRef.current = null;
    }
  };

  const onBallPointerCancel = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    if (drag.moved) {
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      const clamped = clampDragPoint(
        drag.originX + dx,
        drag.originY + dy,
        viewport,
      );
      finishDrag(clamped.x + BALL_SIZE / 2, clamped.y + BALL_SIZE / 2);
    } else {
      dragRef.current = null;
      setDragging(false);
      setDragPoint(null);
    }
  };

  const fileActionsEnabled = !!fileId;
  const serverFileActionsEnabled =
    !!fileId && !isLocalDraftFileId(fileId);

  const bridgeStyle: CSSProperties = {
    left: displayPoint.x,
    top: displayPoint.y,
    width: BALL_SIZE,
    height: BALL_SIZE,
    ["--ep-dock-hide" as string]: `${DOCK_HIDE}px`,
    ["--ep-ball-panel-gap" as string]: `${BALL_PANEL_SEPARATION}px`,
  };

  return (
    <div
      ref={rootRef}
      className={[
        "editor-bridge",
        `editor-bridge--edge-${anchor.edge}`,
        open ? "editor-bridge--open" : "",
        dragging ? "editor-bridge--dragging" : "",
        docked ? "editor-bridge--docked" : "",
        draftStatus === "draft" ? "editor-bridge--unsaved" : "",
        draftStatus === "synced" ? "editor-bridge--saved" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={bridgeStyle}
      aria-label="EditorHub"
    >
      <div className="editor-bridge__peel-zone" aria-hidden="true" />
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="editor-bridge__dismiss-layer"
              aria-hidden="true"
              onPointerDown={closeSidebarPanel}
            />,
            document.body,
          )
        : null}
      {open ? (
        <div
          className="editor-bridge__menu"
          style={menuShellStyle}
          onPointerDown={(event) => {
            if (!recentOpen) {
              return;
            }
            const target = event.target;
            if (!(target instanceof Element)) {
              return;
            }
            if (target.closest(".editor-bridge__recent-flyout")) {
              return;
            }
            if (target.closest(".editor-bridge__action--active")) {
              return;
            }
            setRecentOpen(false);
          }}
        >
          <nav className="editor-bridge__panel" aria-label="文档操作">
            <div className="editor-bridge__group" role="group" aria-label="保存与版本">
              <SidebarActionButton
                label="保存"
                icon="save"
                disabled={!fileActionsEnabled}
                title={fileActionsEnabled ? "保存" : "打开文档后可保存"}
                onClick={() => closeAndRun(dispatchHostSave)}
              />
              <SidebarActionButton
                label="嵌入"
                icon="embed"
                disabled={!serverFileActionsEnabled}
                title={
                  serverFileActionsEnabled
                    ? "嵌入"
                    : fileActionsEnabled
                      ? "保存到服务器后可嵌入"
                      : "打开文档后可嵌入"
                }
                onClick={() => closeAndRun(dispatchHostEmbed)}
              />
              <SidebarActionButton
                label="历史"
                icon="history"
                disabled={!fileActionsEnabled}
                title={
                  fileActionsEnabled
                    ? "历史版本"
                    : "打开文档后可查看历史"
                }
                onClick={() => closeAndRun(dispatchHostHistory)}
              />
            </div>
            <SidebarDivider />
            <div className="editor-bridge__group" role="group" aria-label="文件与最近">
              <button
                type="button"
                className={[
                  "editor-bridge__action",
                  recentOpen ? "editor-bridge__action--active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                title={
                  fileActionsEnabled
                    ? recentOpen
                      ? "收起最近文件"
                      : "最近打开的文件"
                    : "打开文档后可查看最近"
                }
                aria-label="最近"
                aria-expanded={recentOpen}
                disabled={!fileActionsEnabled}
                onClick={() => setRecentOpen((value) => !value)}
              >
                <SidebarGlyph type="recent" />
                <span className="editor-bridge__action-label">最近</span>
              </button>
              <SidebarActionButton
                label="文件"
                icon="files"
                title="返回文件列表"
                onClick={() => closeAndRun(() => dispatchShellNavigate("home"))}
              />
            </div>
            <SidebarDivider />
            <div className="editor-bridge__group" role="group" aria-label="导入与导出">
              <SidebarActionButton
                label="导入"
                icon="import"
                disabled={!fileActionsEnabled}
                title={fileActionsEnabled ? "导入" : "打开文档后可导入"}
                onClick={() => closeAndRun(dispatchHostImport)}
              />
              <SidebarActionButton
                label="导出"
                icon="export"
                disabled={!fileActionsEnabled}
                title={fileActionsEnabled ? "导出" : "打开文档后可导出"}
                onClick={() => closeAndRun(dispatchHostExport)}
              />
            </div>
            <SidebarDivider />
            <div className="editor-bridge__group" role="group" aria-label="文档信息">
              <SidebarActionButton
                label="信息"
                icon="info"
                disabled={!fileActionsEnabled}
                title={fileActionsEnabled ? "文件信息" : "打开文档后可查看信息"}
                onClick={() => {
                  setOpen(false);
                  setRecentOpen(false);
                  setShowFileInfo(true);
                }}
              />
            </div>
          </nav>
          {recentOpen && fileActionsEnabled ? (
            <aside
              className="editor-bridge__recent-flyout"
              aria-label="最近打开的文件"
            >
              <p className="editor-bridge__recent-flyout-title">最近打开</p>
              <SidebarRecentList
                anchorEdge={anchor.edge}
                excludeFileId={fileId}
                onSelect={openRecentFile}
              />
            </aside>
          ) : null}
        </div>
      ) : null}
      <div className="editor-bridge__ball-anchor">
        <button
          type="button"
          className="editor-bridge__ball"
          aria-label={
            open
              ? "关闭操作面板"
              : draftStatusLabel
                ? `打开操作面板（${draftStatusLabel}，可拖拽）`
                : "打开操作面板（可拖拽）"
          }
          aria-expanded={open}
          title={
            draftStatusLabel
              ? `${draftStatusLabel} · Ctrl+S 保存`
              : "Ctrl+S 保存"
          }
          onPointerDown={onBallPointerDown}
          onPointerMove={onBallPointerMove}
          onPointerUp={onBallPointerUp}
          onPointerCancel={onBallPointerCancel}
        >
          <span className="editor-bridge__ball-viewport" aria-hidden="true">
            <span className="editor-bridge__ball-icon-ring" aria-hidden="true">
              <img src={ballIconSrc} alt="" width={28} height={28} draggable={false} />
            </span>
          </span>
        </button>
        {draftStatusLabel ? (
          <span
            className="editor-bridge__status-dot"
            aria-hidden="true"
            title={draftStatusLabel}
          />
        ) : null}
      </div>
      <FileInfoDialog
        fileId={fileId}
        open={showFileInfo}
        onClose={() => setShowFileInfo(false)}
      />
    </div>
  );
}

export function EditorPlatformShell({ children }: { children: ReactNode }) {
  return (
    <div className="editor-platform-shell">
      <EditorPlatformSidebar />
      <div className="editor-platform-shell__content">{children}</div>
    </div>
  );
}
