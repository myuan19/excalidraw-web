import { createPortal } from "react-dom";
import type { ReactNode } from "react";

import type { ShellTheme } from "../hooks/useShellTheme";

import {
  ShellDialogOverlay,
  type ShellOverlayDismissHandlers,
} from "./ShellDialogOverlay";

type ShellDialogPortalProps = {
  open: boolean;
  children: ReactNode;
  className?: string;
  theme?: ShellTheme;
  overlayDismiss?: ShellOverlayDismissHandlers;
  onBackdropClick?: () => void;
  role?: string;
  "aria-modal"?: boolean;
};

/**
 * 文件列表外壳弹窗统一 portal 挂载点（document.body）。
 * 避免 in-tree / body 混用导致遮罩叠层、切换弹窗时闪烁。
 */
export function ShellDialogPortal({
  open,
  children,
  ...overlayProps
}: ShellDialogPortalProps) {
  if (!open) {
    return null;
  }

  return createPortal(
    <ShellDialogOverlay {...overlayProps}>{children}</ShellDialogOverlay>,
    document.body,
  );
}
