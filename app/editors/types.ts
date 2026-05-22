import type { ComponentType } from "react";

export interface EditorDefinition {
  kind: string;
  displayName: string;
  supportedExtensions: string[];
  loadComponent: () => Promise<{ default: ComponentType }>;
}
