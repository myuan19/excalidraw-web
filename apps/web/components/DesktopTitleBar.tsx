import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  HOME_APP_TITLE,
  MAIN_SITE_ICON,
} from "../lib/appBranding";
import {
  devDebug,
  isTitlebarTabsLayoutDebugEnabled,
} from "../lib/devDebug";
import { traceTab, id8 } from "../lib/interactionDebugTrace";
import { isDesktopEditorHub } from "../lib/runtimePlatform";
import { readFileDraftStatus, readFileDraftStatusLabel } from "../hooks/useFileDraftStatus";
import {
  activateEditorTab,
  closeEditorTabWithSnapshot,
  renameOpenFileTab,
  reorderOpenFileTab,
} from "../shell/editorTabNavigation";
import {
  EDITOR_TABS_CHANGE_EVENT,
  HOME_TAB_ID,
  readEditorTabsState,
  type EditorTabsState,
  type FileEditorTab,
} from "../shell/editorTabs";

import "./DesktopTitleBar.scss";

type FileTabId = FileEditorTab["id"];

function roundedLayoutNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

function collectTitlebarElementLayout(el: Element | null) {
  if (!el) {
    return null;
  }
  const rect = el.getBoundingClientRect();
  const htmlEl = el as HTMLElement;
  const style = window.getComputedStyle(el);
  return {
    x: roundedLayoutNumber(rect.x),
    y: roundedLayoutNumber(rect.y),
    width: roundedLayoutNumber(rect.width),
    height: roundedLayoutNumber(rect.height),
    clientWidth: roundedLayoutNumber(htmlEl.clientWidth),
    scrollWidth: roundedLayoutNumber(htmlEl.scrollWidth),
    offsetWidth: roundedLayoutNumber(htmlEl.offsetWidth),
    flexBasis: style.flexBasis,
    flexGrow: style.flexGrow,
    flexShrink: style.flexShrink,
    minWidth: style.minWidth,
    maxWidth: style.maxWidth,
    overflowX: style.overflowX,
  };
}

function debugInlineTabsLayout(
  label: string,
  data: Record<string, unknown>,
): void {
  if (!isTitlebarTabsLayoutDebugEnabled()) {
    return;
  }
  devDebug("app", `InlineTabs layout | ${label}`, data);
}

function MinimizeIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2 6h8" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <rect
        x="2.5"
        y="2.5"
        width="7"
        height="7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path
        d="M4 3.5h4.5V8M3.5 4v4.5H8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path
        d="M3 3l6 6M9 3L3 9"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.5 6.5L8 2l5.5 4.5V13a1 1 0 01-1 1h-3V10H6.5v4h-3a1 1 0 01-1-1V6.5z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TabCloseIcon() {
  return (
    <svg viewBox="0 0 8 8" width="8" height="8" aria-hidden="true">
      <path
        d="M1.5 1.5l5 5M6.5 1.5l-5 5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function useTabDraftIndicator(tab: FileEditorTab) {
  const [indicator, setIndicator] = useState(() => ({
    unsaved: readFileDraftStatus(tab.fileId) === "draft",
    label: readFileDraftStatusLabel(tab.fileId),
  }));

  useEffect(() => {
    const sync = () => {
      setIndicator({
        unsaved: readFileDraftStatus(tab.fileId) === "draft",
        label: readFileDraftStatusLabel(tab.fileId),
      });
    };
    window.addEventListener("excalidraw-file-sync-state", sync);
    return () => window.removeEventListener("excalidraw-file-sync-state", sync);
  }, [tab.fileId]);

  return indicator;
}

function FileTab({
  tab,
  active,
  dragging,
  dragOffset,
  shift,
  onActivate,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  tab: FileEditorTab;
  active: boolean;
  dragging: boolean;
  dragOffset: number;
  shift: number;
  onActivate: (tab: FileEditorTab) => void;
  onPointerDown: (
    tab: FileEditorTab,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const { unsaved, label: draftStatusLabel } = useTabDraftIndicator(tab);
  const shifting = !dragging && shift !== 0;
  const style = dragging
    ? ({ "--titlebar-tab-drag-x": `${dragOffset}px` } as CSSProperties)
    : shifting
      ? ({ "--titlebar-tab-shift-x": `${shift}px` } as CSSProperties)
      : undefined;

  return (
    <div
      className={`titlebar-tabs__tab${active ? " titlebar-tabs__tab--active" : ""}${unsaved ? " titlebar-tabs__tab--unsaved" : ""}${dragging ? " titlebar-tabs__tab--dragging" : ""}${shifting ? " titlebar-tabs__tab--shifting" : ""}`}
      data-editor-tab-id={tab.id}
      style={style}
      onPointerDown={(event) => onPointerDown(tab, event)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <button
        type="button"
        role="tab"
        aria-selected={active}
        className="titlebar-tabs__activate"
        onClick={() => {
          traceTab("titlebar.click", {
            tabId: tab.id,
            fileId8: id8(tab.fileId),
            unsaved,
          });
          onActivate(tab);
        }}
      >
        {unsaved ? (
          <span
            className="titlebar-tabs__dot"
            aria-label={draftStatusLabel ?? "未保存"}
          />
        ) : null}
        <span className="titlebar-tabs__label">{tab.title}</span>
      </button>
      <button
        type="button"
        className="titlebar-tabs__close"
        aria-label={`关闭 ${tab.title}`}
        onClick={() => {
          traceTab("titlebar.closeClick", {
            tabId: tab.id,
            fileId8: id8(tab.fileId),
            unsaved,
          });
          devDebug("app", "[DEBUG] InlineTabs | closeTab", {
            tabId: tab.id,
            fileId8: tab.fileId.slice(0, 8),
            unsaved,
          });
          void closeEditorTabWithSnapshot(tab.id);
        }}
      >
        <TabCloseIcon />
      </button>
    </div>
  );
}

function ScrollArrow({
  direction,
  visible,
  onClick,
}: {
  direction: "left" | "right";
  visible: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={[
        "shell-tab-strip__arrow",
        `titlebar-tabs__scroll titlebar-tabs__scroll--${direction}`,
        visible ? "shell-tab-strip__arrow--visible" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={direction === "left" ? "向左滚动标签" : "向右滚动标签"}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      onClick={onClick}
    >
      <svg viewBox="0 0 8 12" width="8" height="12" aria-hidden="true">
        {direction === "left" ? (
          <path d="M6 1L1.5 6L6 11" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M2 1L6.5 6L2 11" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    </button>
  );
}

function InlineTabs() {
  const [state, setState] = useState<EditorTabsState>(() =>
    readEditorTabsState(),
  );
  const [overflow, setOverflow] = useState<{ left: boolean; right: boolean }>({
    left: false,
    right: false,
  });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [draggingTabId, setDraggingTabId] = useState<FileTabId | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragTargetIndex, setDragTargetIndex] = useState<number | null>(null);
  const pendingDragOffsetRef = useRef(0);
  const dragOffsetFrameRef = useRef<number | null>(null);
  const dragSessionRef = useRef<{
    pointerId: number;
    sourceTabId: FileTabId;
    sourceIndex: number;
    startX: number;
    width: number;
    centers: number[];
    ids: FileTabId[];
    moved: boolean;
  } | null>(null);
  const dragTargetIndexRef = useRef<number | null>(null);
  const suppressClickTabIdRef = useRef<string | null>(null);

  const collectInlineTabsLayoutDebug = useCallback(
    (data: Record<string, unknown> = {}) => {
      const wrapper = wrapperRef.current;
      const scrollEl = scrollRef.current;
      const homeTab = scrollEl?.querySelector(
        `[data-editor-tab-id="${HOME_TAB_ID}"]`,
      ) ?? null;
      const activeTab = scrollEl?.querySelector("[aria-selected='true']")
        ?.closest("[data-editor-tab-id]") ?? null;
      return {
        activeTabId: state.activeTabId,
        tabCount: state.tabs.length,
        tabIds: state.tabs.map((tab) => tab.id),
        overflow,
        wrapper: collectTitlebarElementLayout(wrapper),
        scroll: collectTitlebarElementLayout(scrollEl),
        leftArrow: collectTitlebarElementLayout(
          wrapper?.querySelector(".titlebar-tabs__scroll--left") ?? null,
        ),
        rightArrow: collectTitlebarElementLayout(
          wrapper?.querySelector(".titlebar-tabs__scroll--right") ?? null,
        ),
        homeTab: collectTitlebarElementLayout(homeTab),
        activeTab: collectTitlebarElementLayout(activeTab),
        ...data,
      };
    },
    [overflow, state.activeTabId, state.tabs],
  );

  useEffect(() => {
    const sync = () => {
      const next = readEditorTabsState();
      devDebug("app", "[DEBUG] InlineTabs | sync", {
        activeTabId: next.activeTabId,
        tabCount: next.tabs.length,
        tabIds: next.tabs.map((t) => t.id),
      });
      setState(next);
    };
    window.addEventListener(EDITOR_TABS_CHANGE_EVENT, sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener(EDITOR_TABS_CHANGE_EVENT, sync);
      window.removeEventListener("hashchange", sync);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (dragOffsetFrameRef.current !== null) {
        window.cancelAnimationFrame(dragOffsetFrameRef.current);
        dragOffsetFrameRef.current = null;
      }
    };
  }, []);

  // Keep tab titles synced with file renames. Renames happen in the file
  // list/editor and only surface through this DOM event; the tab owns its
  // displayed title, so it must apply the new name to its session state.
  useEffect(() => {
    const onRenamed = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; name?: string }>)
        .detail;
      if (!detail?.id || !detail.name) {
        return;
      }
      devDebug("app", "[DEBUG] InlineTabs | renameTab", {
        fileId8: detail.id.slice(0, 8),
        name: detail.name,
      });
      renameOpenFileTab(detail.id, detail.name);
    };
    window.addEventListener("excalidraw-file-renamed", onRenamed);
    return () =>
      window.removeEventListener("excalidraw-file-renamed", onRenamed);
  }, []);

  const checkOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const hasLeft = el.scrollLeft > 1;
    const hasRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setOverflow((prev) => {
      if (prev.left === hasLeft && prev.right === hasRight) return prev;
      const next = { left: hasLeft, right: hasRight };
      debugInlineTabsLayout(
        "tabs overflow changed",
        collectInlineTabsLayoutDebug({
          previousOverflow: prev,
          nextOverflow: next,
          scrollLeft: roundedLayoutNumber(el.scrollLeft),
          clientWidth: roundedLayoutNumber(el.clientWidth),
          scrollWidth: roundedLayoutNumber(el.scrollWidth),
        }),
      );
      window.requestAnimationFrame(() => {
        debugInlineTabsLayout(
          "tabs layout next frame",
          collectInlineTabsLayoutDebug({
            previousOverflow: prev,
            nextOverflow: next,
            scrollLeft: roundedLayoutNumber(el.scrollLeft),
            clientWidth: roundedLayoutNumber(el.clientWidth),
            scrollWidth: roundedLayoutNumber(el.scrollWidth),
          }),
        );
      });
      return next;
    });
  }, [collectInlineTabsLayoutDebug]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkOverflow();
    el.addEventListener("scroll", checkOverflow, { passive: true });
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", checkOverflow);
      ro.disconnect();
    };
  }, [checkOverflow]);

  useEffect(() => {
    if (!isTitlebarTabsLayoutDebugEnabled()) {
      return;
    }
    debugInlineTabsLayout(
      "tabs state committed",
      collectInlineTabsLayoutDebug({ trigger: "tabs-state" }),
    );
    const raf = window.requestAnimationFrame(() => {
      debugInlineTabsLayout(
        "tabs state next frame",
        collectInlineTabsLayoutDebug({ trigger: "tabs-state" }),
      );
    });
    return () => window.cancelAnimationFrame(raf);
  }, [collectInlineTabsLayoutDebug, state.activeTabId, state.tabs.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const activeEl = el.querySelector("[aria-selected='true']");
    if (activeEl) {
      (activeEl as HTMLElement).scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    checkOverflow();
  }, [state.activeTabId, state.tabs.length, checkOverflow]);

  const scroll = useCallback((direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === "left" ? -120 : 120, behavior: "smooth" });
  }, []);

  const clearDragState = useCallback(() => {
    if (dragOffsetFrameRef.current !== null) {
      window.cancelAnimationFrame(dragOffsetFrameRef.current);
      dragOffsetFrameRef.current = null;
    }
    pendingDragOffsetRef.current = 0;
    dragSessionRef.current = null;
    dragTargetIndexRef.current = null;
    setDraggingTabId(null);
    setDragOffset(0);
    setDragTargetIndex(null);
  }, []);

  const scheduleDragOffset = useCallback((delta: number) => {
    pendingDragOffsetRef.current = delta;
    if (dragOffsetFrameRef.current !== null) {
      return;
    }
    dragOffsetFrameRef.current = window.requestAnimationFrame(() => {
      dragOffsetFrameRef.current = null;
      setDragOffset(pendingDragOffsetRef.current);
    });
  }, []);

  const onTabActivate = useCallback((tab: FileEditorTab) => {
    if (suppressClickTabIdRef.current === tab.id) {
      suppressClickTabIdRef.current = null;
      return;
    }
    devDebug("app", "[DEBUG] InlineTabs | activateTab", {
      tabId: tab.id,
      fileId8: tab.fileId.slice(0, 8),
    });
    void activateEditorTab(tab.id);
  }, []);

  // Drag is a pure reorder of the top tab strip: the dragged tab follows the
  // pointer via transform while its DOM slot stays fixed, and siblings slide to
  // open a gap. The order is committed once on pointer up. Because the DOM is
  // never reordered mid-drag, the dragged tab can't jump off the cursor and the
  // editor content host below is never re-rendered while dragging.
  const onTabPointerDown = useCallback(
    (tab: FileEditorTab, event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(".titlebar-tabs__close")
      ) {
        return;
      }
      const scrollEl = scrollRef.current;
      if (!scrollEl) {
        return;
      }
      const tabEls = Array.from(
        scrollEl.querySelectorAll<HTMLElement>("[data-editor-tab-id]"),
      );
      const ids = tabEls.map((el) => el.dataset.editorTabId as FileTabId);
      const sourceIndex = ids.indexOf(tab.id);
      if (sourceIndex < 0) {
        return;
      }
      const rects = tabEls.map((el) => el.getBoundingClientRect());
      dragSessionRef.current = {
        pointerId: event.pointerId,
        sourceTabId: tab.id,
        sourceIndex,
        startX: event.clientX,
        width: rects[sourceIndex].width,
        centers: rects.map((rect) => rect.left + rect.width / 2),
        ids,
        moved: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      devDebug("app", "[DEBUG] InlineTabs | dragStart", {
        tabId: tab.id,
        sourceIndex,
      });
    },
    [],
  );

  const onTabPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const session = dragSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) {
        return;
      }
      const delta = event.clientX - session.startX;
      if (!session.moved) {
        if (Math.abs(delta) <= 4) {
          return;
        }
        session.moved = true;
        suppressClickTabIdRef.current = session.sourceTabId;
        setDraggingTabId(session.sourceTabId);
        dragTargetIndexRef.current = session.sourceIndex;
        setDragTargetIndex(session.sourceIndex);
      }
      event.preventDefault();
      scheduleDragOffset(delta);
      const draggedCenter = session.centers[session.sourceIndex] + delta;
      let nextIndex = session.sourceIndex;
      while (nextIndex > 0 && draggedCenter < session.centers[nextIndex - 1]) {
        nextIndex -= 1;
      }
      while (
        nextIndex < session.centers.length - 1 &&
        draggedCenter > session.centers[nextIndex + 1]
      ) {
        nextIndex += 1;
      }
      if (nextIndex !== dragTargetIndexRef.current) {
        dragTargetIndexRef.current = nextIndex;
        setDragTargetIndex(nextIndex);
      }
    },
    [scheduleDragOffset],
  );

  const onTabPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const session = dragSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) {
        return;
      }
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already be released; ignore.
      }
      const targetIndex = dragTargetIndexRef.current;
      if (!session.moved) {
        suppressClickTabIdRef.current = session.sourceTabId;
        devDebug("app", "[DEBUG] InlineTabs | pointerActivate", {
          tabId: session.sourceTabId,
        });
        void activateEditorTab(session.sourceTabId);
      } else if (
        targetIndex != null &&
        targetIndex !== session.sourceIndex &&
        session.ids[targetIndex]
      ) {
        const targetTabId = session.ids[targetIndex];
        const position =
          targetIndex > session.sourceIndex ? "after" : "before";
        devDebug("app", "[DEBUG] InlineTabs | drop", {
          sourceTabId: session.sourceTabId,
          targetTabId,
          position,
        });
        reorderOpenFileTab({
          sourceTabId: session.sourceTabId,
          targetTabId,
          position,
        });
      }
      clearDragState();
    },
    [clearDragState],
  );

  const onTabPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (dragSessionRef.current?.pointerId === event.pointerId) {
        clearDragState();
      }
    },
    [clearDragState],
  );

  const dragSession = dragSessionRef.current;
  const computeTabShift = (tabId: FileTabId): number => {
    if (
      !dragSession ||
      draggingTabId == null ||
      dragTargetIndex == null ||
      tabId === draggingTabId
    ) {
      return 0;
    }
    const index = dragSession.ids.indexOf(tabId);
    if (index < 0) {
      return 0;
    }
    const from = dragSession.sourceIndex;
    const to = dragTargetIndex;
    if (from < to && index > from && index <= to) {
      return -dragSession.width;
    }
    if (from > to && index >= to && index < from) {
      return dragSession.width;
    }
    return 0;
  };

  return (
    <div
      ref={wrapperRef}
      className={[
        "shell-tab-strip",
        "titlebar-tabs__wrapper",
        draggingTabId ? "titlebar-tabs__wrapper--dragging" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <ScrollArrow
        direction="left"
        visible={overflow.left}
        onClick={() => scroll("left")}
      />
      <div
        ref={scrollRef}
        className="shell-tab-strip__scroll titlebar-tabs"
        role="tablist"
        aria-label="打开的页面"
      >
        {state.tabs.map((tab) => {
          const active = tab.id === state.activeTabId;
          if (tab.id === HOME_TAB_ID) {
            return (
              <div
                key={tab.id}
                data-editor-tab-id={tab.id}
                className={`titlebar-tabs__tab titlebar-tabs__tab--home${active ? " titlebar-tabs__tab--active" : ""}`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className="titlebar-tabs__activate"
                  onClick={() => {
                    devDebug("app", "[DEBUG] InlineTabs | activateHome");
                    void activateEditorTab(tab.id);
                  }}
                >
                  <HomeIcon />
                  <span className="titlebar-tabs__label">{tab.title}</span>
                </button>
                <span
                  className="titlebar-tabs__close-placeholder"
                  aria-hidden="true"
                />
              </div>
            );
          }
          const fileTabId = tab.id as FileTabId;
          return (
            <FileTab
              key={tab.id}
              tab={tab as FileEditorTab}
              active={active}
              dragging={draggingTabId === fileTabId}
              dragOffset={draggingTabId === fileTabId ? dragOffset : 0}
              shift={computeTabShift(fileTabId)}
              onActivate={onTabActivate}
              onPointerDown={onTabPointerDown}
              onPointerMove={onTabPointerMove}
              onPointerUp={onTabPointerUp}
              onPointerCancel={onTabPointerCancel}
            />
          );
        })}
      </div>
      <ScrollArrow
        direction="right"
        visible={overflow.right}
        onClick={() => scroll("right")}
      />
    </div>
  );
}

export function DesktopTitleBar() {
  const desktopApi = window.editorHubDesktop;
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!desktopApi?.windowIsMaximized) {
      return;
    }
    let cancelled = false;
    void desktopApi.windowIsMaximized().then((value) => {
      if (!cancelled) {
        setMaximized(value);
      }
    });
    const unsubscribe = desktopApi.onWindowMaximized?.((value) => {
      setMaximized(value);
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [desktopApi]);

  const toggleMaximize = useCallback(() => {
    void desktopApi?.windowToggleMaximize?.().then((value) => {
      setMaximized(value);
    });
  }, [desktopApi]);

  const onDragRegionDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.currentTarget !== event.target) {
        return;
      }
      toggleMaximize();
    },
    [toggleMaximize],
  );

  if (!isDesktopEditorHub() || !desktopApi?.windowMinimize) {
    return null;
  }

  return (
    <header className="desktop-titlebar" data-testid="desktop-titlebar">
      <div className="desktop-titlebar__brand">
        <img
          className="desktop-titlebar__icon"
          src={MAIN_SITE_ICON}
          alt=""
          draggable={false}
        />
        <span className="desktop-titlebar__title">{HOME_APP_TITLE}</span>
      </div>
      <div
        className="desktop-titlebar__drag"
        onDoubleClick={onDragRegionDoubleClick}
      >
        <InlineTabs />
      </div>
      <div className="desktop-titlebar__controls">
        <button
          type="button"
          className="desktop-titlebar__control"
          aria-label="最小化"
          onClick={() => {
            void desktopApi.windowMinimize?.();
          }}
        >
          <MinimizeIcon />
        </button>
        <button
          type="button"
          className="desktop-titlebar__control"
          aria-label={maximized ? "还原" : "最大化"}
          onClick={toggleMaximize}
        >
          {maximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
        <button
          type="button"
          className="desktop-titlebar__control desktop-titlebar__control--close"
          aria-label="关闭"
          onClick={() => {
            void (desktopApi.requestWindowClose ?? desktopApi.windowClose)?.();
          }}
        >
          <CloseIcon />
        </button>
      </div>
    </header>
  );
}
