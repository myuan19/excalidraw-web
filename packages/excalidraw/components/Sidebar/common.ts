import type React from "react";

export interface SidebarProps {
  name: string;
  children?: React.ReactNode;
  className?: string;
  docked?: boolean;
  onDock?: (docked: boolean) => void;
}

export interface SidebarTriggerProps {
  name: string;
  children?: React.ReactNode;
}
