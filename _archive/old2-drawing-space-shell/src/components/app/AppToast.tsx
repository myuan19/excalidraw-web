import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { APP_NOTICE_EVENT, type AppNoticePayload } from "@/features/ui/appNotice";
import { cn } from "@/lib/utils";

const AUTO_DISMISS_MS = 3000;

export function AppToast() {
  const [notice, setNotice] = useState<AppNoticePayload | null>(null);
  const dismissTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const onNotice = (event: Event) => {
      const detail = (event as CustomEvent<AppNoticePayload>).detail;
      setNotice(detail);
      if (dismissTimerRef.current) {
        window.clearTimeout(dismissTimerRef.current);
      }
      dismissTimerRef.current = window.setTimeout(() => {
        setNotice(null);
        dismissTimerRef.current = null;
      }, AUTO_DISMISS_MS);
    };
    window.addEventListener(APP_NOTICE_EVENT, onNotice);
    return () => {
      window.removeEventListener(APP_NOTICE_EVENT, onNotice);
      if (dismissTimerRef.current) {
        window.clearTimeout(dismissTimerRef.current);
      }
    };
  }, []);

  if (!notice) return null;

  return createPortal(
    <div className="app-toast-host pointer-events-none fixed inset-0 z-toast flex items-end justify-center pb-[18%]">
      <div
        className={cn(
          "app-toast pointer-events-auto border border-border bg-surface px-xl py-md text-body shadow-lg",
          notice.level === "error" && "border-danger/30 text-danger",
          notice.level === "warning" && "border-warning/30 text-warning",
          notice.level === "info" && "border-accent/30 text-foreground",
        )}
        role="status"
        aria-live="polite"
      >
        {notice.message}
      </div>
    </div>,
    document.body,
  );
}
