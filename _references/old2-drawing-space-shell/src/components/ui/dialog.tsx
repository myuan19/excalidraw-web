import { useEffect, useRef, type HTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface DialogProps {
  open: boolean;
  onClose(): void;
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const dialogSizeClass: Record<NonNullable<DialogProps["size"]>, string> = {
  sm: "w-[min(28rem,calc(100vw-2rem))] min-w-[18rem]",
  md: "w-[min(36rem,calc(100vw-2rem))] min-w-[22rem]",
  lg: "w-[min(48rem,calc(100vw-2rem))] min-w-[24rem]",
  xl: "w-[min(64rem,calc(100vw-2rem))] min-w-[28rem]",
};

export function Dialog({ open, onClose, children, className, size = "sm" }: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-dialog flex items-center justify-center bg-overlay p-lg"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        className={cn(
          "dialog-panel box-border max-h-[calc(100vh-2rem)] shrink-0 overflow-auto border border-border bg-surface p-xl",
          dialogSizeClass[size],
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-xl", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("m-0 text-title font-weight-strong", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-xs text-body text-muted", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-xl flex justify-end gap-sm", className)} {...props} />;
}
