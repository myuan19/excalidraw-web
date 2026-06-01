import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { getFileIdFromHash } from "../data/fileIdFromHash";
import { isLocalDraftFileId } from "../data/localDraftFileId";
import { readFileListTreeCache } from "../data/fileListSessionCache";
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
import { APP_SHELL_GO_HOME } from "../shell/Sidebar";
import type { AppView } from "../shell/useAppView";

import "./EditorPlatformSidebar.scss";

const BALL_SIZE = 52;
const EDGE_INSET = 10;
const PEEK_VISIBLE = 14;
const DOCK_HIDE = BALL_SIZE - PEEK_VISIBLE;
const DRAG_THRESHOLD_PX = 6;
const PANEL_GAP = 6;
/** 面板展开时，小球沿边缘方向再退后一点，避免与卡片贴太紧 */
const BALL_PANEL_SEPARATION = 4;
/** 竖向分组：保存/嵌入/历史 | 信息/导入/导出 | 文件 */
const PANEL_HEIGHT = 390;
const PANEL_WIDTH = 72;
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
  | "files";

type AnchorPosition = {
  edge: SnapEdge;
  /** 0–1 position along the edge (vertical for left/right, horizontal for top/bottom) */
  ratio: number;
};

const DEFAULT_ANCHOR: AnchorPosition = { edge: "left", ratio: 0.38 };

const ACTION_ICONS: Record<ActionIcon, string> = {
  save:
    "M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z",
  export:
    "M5 20h14v-2H5v2zm7-18l-5 5h3v6h4V7h3l-5-5z",
  import:
    "M5 20h14v-2H5v2zm7-18v6H9l3 3 3-3h-3V2zm-6 9h2v4h8v-4h2v6H6v-6z",
  info:
    "M11 17h2v-6h-2v6zm1-14a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 16a7 7 0 1 1 0-14 7 7 0 0 1 0 14zm-1-10h2V7h-2v2z",
  embed:
    "M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4z",
  history:
    "M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z",
  files:
    "M10 4l2 2h8c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h6z",
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

function computePanelStyle(
  anchor: AnchorPosition,
  displayPoint: { x: number; y: number },
  viewport: { width: number; height: number },
): CSSProperties {
  const travelRatio = edgeTravelRatio(anchor, displayPoint, viewport);

  if (anchor.edge === "left" || anchor.edge === "right") {
    const top = clampPanelOffset(
      panelOffsetAlongBall(travelRatio, BALL_SIZE, PANEL_HEIGHT),
      PANEL_HEIGHT,
      displayPoint.y,
      viewport.height,
    );

    if (anchor.edge === "left") {
      return { left: `calc(100% + ${PANEL_GAP}px)`, top, transform: "none" };
    }
    return { right: `calc(100% + ${PANEL_GAP}px)`, top, transform: "none" };
  }

  const left = clampPanelOffset(
    panelOffsetAlongBall(travelRatio, BALL_SIZE, PANEL_WIDTH),
    PANEL_WIDTH,
    displayPoint.x,
    viewport.width,
  );

  if (anchor.edge === "top") {
    return { top: `calc(100% + ${PANEL_GAP}px)`, left, transform: "none" };
  }
  return { bottom: `calc(100% + ${PANEL_GAP}px)`, left, transform: "none" };
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
  window.dispatchEvent(
    new CustomEvent(APP_SHELL_GO_HOME, { detail: { target } }),
  );
}

function SidebarDivider() {
  return <div className="editor-bridge__divider" role="separator" />;
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
  let file = cached?.files.find((item) => item.id === fileId);

  if (!file) {
    const tree = await ServerSync.listFileTree();
    folders = tree.folders;
    file = tree.files.find((item) => item.id === fileId);
  }

  if (!file) {
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

  const settledPoint = anchorToPoint(anchor, viewport);
  const displayPoint = dragPoint ?? settledPoint;
  const docked = !dragging && !open;
  const panelStyle = useMemo(
    () => computePanelStyle(anchor, displayPoint, viewport),
    [anchor, displayPoint, viewport],
  );

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
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const closeAndRun = useCallback((action: () => void) => {
    setOpen(false);
    action();
  }, []);

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
      {open ? (
        <nav
          className="editor-bridge__panel"
          style={panelStyle}
          aria-label="文档操作"
        >
          {/* 保存与嵌入、历史 */}
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
            disabled={!serverFileActionsEnabled}
            title={
              serverFileActionsEnabled
                ? "历史版本"
                : fileActionsEnabled
                  ? "保存到服务器后可查看历史"
                  : "保存后可查看历史"
            }
            onClick={() => closeAndRun(dispatchHostHistory)}
          />
          <SidebarDivider />
          {/* 信息 / 导入 / 导出 */}
          <SidebarActionButton
            label="信息"
            icon="info"
            disabled={!fileActionsEnabled}
            title={fileActionsEnabled ? "文件信息" : "打开文档后可查看信息"}
            onClick={() => {
              setOpen(false);
              setShowFileInfo(true);
            }}
          />
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
          <SidebarDivider />
          {/* 返回文件列表 */}
          <SidebarActionButton
            label="文件"
            icon="files"
            onClick={() => closeAndRun(() => dispatchShellNavigate("home"))}
          />
        </nav>
      ) : null}
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
        {draftStatusLabel ? (
          <span
            className="editor-bridge__status-dot"
            aria-hidden="true"
            title={draftStatusLabel}
          />
        ) : null}
      </button>
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
