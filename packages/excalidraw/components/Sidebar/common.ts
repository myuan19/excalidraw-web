import React from "react";

import type { AppState, SidebarName, SidebarTabName } from "../../types";
import type { JSX } from "react";

export type SidebarTriggerProps = {
  name: SidebarName;
  tab?: SidebarTabName;
  icon?: JSX.Element;
  children?: React.ReactNode;
  title?: string;
  className?: string;
  onToggle?: (open: boolean) => void;
  style?: React.CSSProperties;
};

export type SidebarProps<P = {}> = {
  name: SidebarName;
  children: React.ReactNode;
  onStateChange?: (state: AppState["openSidebar"]) => void;
  onDock?: (docked: boolean) => void;
  docked?: boolean;
  className?: string;
  __fallback?: boolean;
} & P;

export type SidebarPropsContextValue = Pick<
  SidebarProps,
  "onDock" | "docked"
> & { onCloseRequest: () => void; shouldRenderDockButton: boolean };

export const SidebarPropsContext =
  React.createContext<SidebarPropsContextValue>({} as SidebarPropsContextValue);
