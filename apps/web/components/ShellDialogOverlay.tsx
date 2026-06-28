import {
  useEffect,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import {
  shellThemeClassName,
  useLiveShellTheme,
  type ShellTheme,
} from "../hooks/useShellTheme";

import "./fileListDialogHost.scss";

export type ShellOverlayDismissHandlers = {
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  onPointerCancel: () => void;
};

type ShellDialogOverlayProps = {
  children: ReactNode;
  className?: string;
  /** 父级已有 useShellTheme 时可传入，减少重复订阅 */
  theme?: ShellTheme;
  overlayDismiss?: ShellOverlayDismissHandlers;
  onBackdropClick?: () => void;
  role?: string;
  "aria-modal"?: boolean;
};

/**
 * 外壳弹窗统一遮罩：filelist-dialog-host + 实时主题 + filelist__detail-overlay。
 */
export function ShellDialogOverlay({
  children,
  className,
  theme: themeProp,
  overlayDismiss,
  onBackdropClick,
  role,
  "aria-modal": ariaModal,
}: ShellDialogOverlayProps) {
  const liveTheme = useLiveShellTheme();
  const theme = themeProp ?? liveTheme;

  return (
    <div
      className={[
        "filelist-dialog-host",
        shellThemeClassName(theme),
        "filelist__detail-overlay",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role={role}
      aria-modal={ariaModal}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onBackdropClick?.();
        }
      }}
      onPointerDown={overlayDismiss?.onPointerDown}
      onPointerUp={overlayDismiss?.onPointerUp}
      onPointerCancel={overlayDismiss?.onPointerCancel}
    >
      {children}
    </div>
  );
}
