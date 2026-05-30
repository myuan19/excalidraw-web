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
import { useFileDraftStatus } from "../hooks/useFileDraftStatus";
import { APP_SHELL_GO_HOME } from "../shell/Sidebar";
import type { AppView } from "../shell/useAppView";

import "./EditorPlatformSidebar.scss";

const DRAWING_SPACE_ICON = "/icons/drawing-space.svg";
const BALL_SIZE = 52;
const EDGE_INSET = 10;
const PEEK_VISIBLE = 14;
const DOCK_HIDE = BALL_SIZE - PEEK_VISIBLE;
const DRAG_THRESHOLD_PX = 6;
const PANEL_GAP = 6;
/** 面板展开时，小球沿边缘方向再退后一点，避免与卡片贴太紧 */
const BALL_PANEL_SEPARATION = 4;
const PANEL_HEIGHT = 228;
const PANEL_WIDTH = 72;
const ANCHOR_STORAGE_KEY = "excalidraw-editor-bridge-anchor-v1";

type SnapEdge = "left" | "right" | "top" | "bottom";
type ActionIcon = "save" | "embed" | "history" | "files";

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
    "M10 4l2 2h8c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h6z",
};

function clampRatio(ratio: number): number {
  return Math.max(0.08, Math.min(0.92, ratio));
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

  if (min === distLeft) {
    return { edge: "left", ratio: clampRatio(centerY / viewport.height) };
  }
  if (min === distRight) {
    return { edge: "right", ratio: clampRatio(centerY / viewport.height) };
  }
  if (min === distTop) {
    return { edge: "top", ratio: clampRatio(centerX / viewport.width) };
  }
  return { edge: "bottom", ratio: clampRatio(centerX / viewport.width) };
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
        y: ratio * viewport.height - BALL_SIZE / 2,
      };
    case "right":
      return {
        x: viewport.width - BALL_SIZE - EDGE_INSET,
        y: ratio * viewport.height - BALL_SIZE / 2,
      };
    case "top":
      return {
        x: ratio * viewport.width - BALL_SIZE / 2,
        y: EDGE_INSET,
      };
    case "bottom":
      return {
        x: ratio * viewport.width - BALL_SIZE / 2,
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
  if (anchor.edge === "left" || anchor.edge === "right") {
    const min = EDGE_INSET;
    const max = viewport.height - BALL_SIZE - EDGE_INSET;
    const span = max - min;
    if (span <= 0) {
      return 0.5;
    }
    return Math.max(0, Math.min(1, (displayPoint.y - min) / span));
  }
  const min = EDGE_INSET;
  const max = viewport.width - BALL_SIZE - EDGE_INSET;
  const span = max - min;
  if (span <= 0) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, (displayPoint.x - min) / span));
}

/** 0 = 卡片与小球顶对齐；0.5 = 中心对齐；1 = 卡片与小球底对齐 */
function panelOffsetAlongBall(
  travelRatio: number,
  ballSize: number,
  panelSize: number,
): number {
  const topAligned = 0;
  const centerAligned = (ballSize - panelSize) / 2;
  const bottomAligned = ballSize - panelSize;
  if (travelRatio <= 0.5) {
    const blend = travelRatio / 0.5;
    return topAligned + (centerAligned - topAligned) * blend;
  }
  const blend = (travelRatio - 0.5) / 0.5;
  return centerAligned + (bottomAligned - centerAligned) * blend;
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

export function EditorPlatformSidebar() {
  const [open, setOpen] = useState(false);
  const [fileId, setFileId] = useState<string | null>(() => getFileIdFromHash());
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
    const syncFileId = () => setFileId(getFileIdFromHash());
    window.addEventListener("hashchange", syncFileId);
    return () => window.removeEventListener("hashchange", syncFileId);
  }, []);

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
      aria-label="绘图空间"
    >
      <div className="editor-bridge__peel-zone" aria-hidden="true" />
      {open ? (
        <nav
          className="editor-bridge__panel"
          style={panelStyle}
          aria-label="文档操作"
        >
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
            disabled={!fileActionsEnabled}
            title={fileActionsEnabled ? "嵌入" : "保存后可嵌入"}
            onClick={() => closeAndRun(dispatchHostEmbed)}
          />
          <SidebarActionButton
            label="历史"
            icon="history"
            disabled={!fileActionsEnabled}
            title={fileActionsEnabled ? "历史版本" : "保存后可查看历史"}
            onClick={() => closeAndRun(dispatchHostHistory)}
          />
          <div className="editor-bridge__divider" role="presentation" />
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
        <img src={DRAWING_SPACE_ICON} alt="" width={28} height={28} draggable={false} />
        {draftStatusLabel ? (
          <span
            className="editor-bridge__status-dot"
            aria-hidden="true"
            title={draftStatusLabel}
          />
        ) : null}
      </button>
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
