import { type PointerEvent, type ReactNode } from "react";

import { shellThemeClassName } from "../hooks/useShellTheme";
import type { StrictOverlayDismissHandlers } from "../hooks/useStrictOverlayDismiss";

import "./fileListDialogHost.scss";

type FileListDialogFrameProps = {
  open: boolean;
  overlayDismiss: StrictOverlayDismissHandlers;
  cardClassName: string;
  children: ReactNode;
};

/** 文件列表弹层共享外壳：token 作用域 + shell-modal 遮罩/卡片。 */
export function FileListDialogFrame({
  open,
  overlayDismiss,
  cardClassName,
  children,
}: FileListDialogFrameProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className={`filelist-dialog-host ${shellThemeClassName()} filelist__detail-overlay`}
      role="dialog"
      aria-modal
      {...overlayDismiss}
    >
      <div
        className={cardClassName}
        onPointerDown={(e: PointerEvent) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
