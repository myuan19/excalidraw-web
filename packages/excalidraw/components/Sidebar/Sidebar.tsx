import React from "react";
import clsx from "clsx";

import { atom } from "../../editor-jotai";

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

function SidebarRoot({
  children,
  className,
  docked,
  onDock,
  name,
}: SidebarProps) {
  const appState = useUIAppState();
  const isOpen = appState.openSidebar?.name === name;

  if (!children || !isOpen) {
    return null;
  }

  return (
    <aside
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
          onCloseRequest: () => {},
          shouldRenderDockButton: !!onDock && docked != null,
        }}
      >
        {children}
      </SidebarPropsContext.Provider>
    </aside>
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
