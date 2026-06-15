import React from "react";

import { atom } from "../../editor-jotai";

export const isSidebarDockedAtom = atom(false);

function SidebarRoot({ children }: { children?: React.ReactNode }) {
  return children ? <aside className="excalidraw-sidebar">{children}</aside> : null;
}

function Slot({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

function Trigger({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

function TabTrigger({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

export const Sidebar = Object.assign(SidebarRoot, {
  Header: Slot,
  Tab: Slot,
  Tabs: Slot,
  TabTrigger,
  TabTriggers: Slot,
  Trigger,
});
