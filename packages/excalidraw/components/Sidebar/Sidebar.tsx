import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import clsx from "clsx";

import { EVENT, KEYS, isDevEnv } from "@excalidraw/common";

import { atom, useSetAtom } from "../../editor-jotai";
import { useOutsideClick } from "../../hooks/useOutsideClick";
import { useEditorInterface, useExcalidrawSetAppState } from "../App";

import { SidebarHeader } from "./SidebarHeader";
import { SidebarTab } from "./SidebarTab";
import { SidebarTabs } from "./SidebarTabs";
import { SidebarTabTrigger } from "./SidebarTabTrigger";
import { SidebarTabTriggers } from "./SidebarTabTriggers";
import { SidebarTrigger } from "./SidebarTrigger";
import { SidebarPropsContext } from "./common";
import { useUIAppState } from "../../context/ui-appState";

import "./Sidebar.scss";

import type { SidebarProps } from "./common";

export const isSidebarDockedAtom = atom(false);

function SidebarInner({
  children,
  className,
  docked,
  onDock,
}: Omit<SidebarProps, "name" | "onStateChange">) {
  if (isDevEnv() && onDock && docked == null) {
    console.warn(
      "Sidebar: `docked` must be set when `onDock` is supplied for the sidebar to be user-dockable. To hide this message, either pass `docked` or remove `onDock`",
    );
  }

  const setAppState = useExcalidrawSetAppState();
  const setIsSidebarDockedAtom = useSetAtom(isSidebarDockedAtom);
  const editorInterface = useEditorInterface();
  const asideRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    setIsSidebarDockedAtom(!!docked);
    return () => {
      setIsSidebarDockedAtom(false);
    };
  }, [setIsSidebarDockedAtom, docked]);

  const closeSidebar = useCallback(() => {
    const isDialogOpen = !!document.querySelector(".Dialog");
    if (isDialogOpen) {
      return;
    }
    setAppState({ openSidebar: null });
  }, [setAppState]);

  useOutsideClick(
    asideRef,
    useCallback(
      (event) => {
        if ((event.target as Element).closest(".sidebar-trigger")) {
          return;
        }
        if (!docked || !editorInterface.canFitSidebar) {
          closeSidebar();
        }
      },
      [closeSidebar, docked, editorInterface.canFitSidebar],
    ),
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === KEYS.ESCAPE &&
        (!docked || !editorInterface.canFitSidebar)
      ) {
        closeSidebar();
      }
    };
    document.addEventListener(EVENT.KEYDOWN, handleKeyDown);
    return () => {
      document.removeEventListener(EVENT.KEYDOWN, handleKeyDown);
    };
  }, [closeSidebar, docked, editorInterface.canFitSidebar]);

  return (
    <aside
      ref={asideRef}
      className={clsx(
        "sidebar",
        "excalidraw-sidebar",
        className,
        docked && "sidebar--docked",
      )}
    >
      <SidebarPropsContext.Provider
        value={{
          docked,
          onDock,
          onCloseRequest: closeSidebar,
          shouldRenderDockButton: !!onDock && docked != null,
        }}
      >
        {children}
      </SidebarPropsContext.Provider>
    </aside>
  );
}

function SidebarRoot({
  children,
  className,
  docked,
  onDock,
  name,
  onStateChange,
}: SidebarProps) {
  const appState = useUIAppState();
  const isOpen = appState.openSidebar?.name === name;

  const refPrevOpenSidebar = useRef(appState.openSidebar);
  useEffect(() => {
    if (
      ((!appState.openSidebar &&
        refPrevOpenSidebar.current?.name === name) ||
        (appState.openSidebar?.name === name &&
          refPrevOpenSidebar.current?.name !== name) ||
        refPrevOpenSidebar.current?.name === name) &&
      appState.openSidebar !== refPrevOpenSidebar.current
    ) {
      onStateChange?.(
        appState.openSidebar?.name !== name ? null : appState.openSidebar,
      );
    }
    refPrevOpenSidebar.current = appState.openSidebar;
  }, [appState.openSidebar, name, onStateChange]);

  if (!children || !isOpen) {
    return null;
  }

  return (
    <SidebarInner
      className={className}
      docked={docked}
      onDock={onDock}
    >
      {children}
    </SidebarInner>
  );
}

export const Sidebar = Object.assign(SidebarRoot, {
  Header: SidebarHeader,
  Tab: SidebarTab,
  Tabs: SidebarTabs,
  TabTrigger: SidebarTabTrigger,
  TabTriggers: SidebarTabTriggers,
  Trigger: SidebarTrigger,
});
