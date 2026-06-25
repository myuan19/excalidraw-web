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

import type { SidebarProps } from "./common";

export const isSidebarDockedAtom = atom(false);

function SidebarRoot({ children, className, docked, onDock }: SidebarProps) {
  return children ? (
    <aside className={clsx("excalidraw-sidebar", className)}>
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
  ) : null;
}

export const Sidebar = Object.assign(SidebarRoot, {
  Header: SidebarHeader,
  Tab: SidebarTab,
  Tabs: SidebarTabs,
  TabTrigger: SidebarTabTrigger,
  TabTriggers: SidebarTabTriggers,
  Trigger: SidebarTrigger,
});
