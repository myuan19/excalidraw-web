import { type HTMLAttributes } from "react";

import { cn } from "../cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {}

export function Card({ className, ...props }: CardProps) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-surface p-xl",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: CardProps) {
  return <div className={cn("mb-lg space-y-xs", className)} {...props} />;
}

export function CardTitle({ className, ...props }: CardProps) {
  return (
    <h2
      className={cn("m-0 text-lg font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: CardProps) {
  return <p className={cn("m-0 text-sm text-muted", className)} {...props} />;
}
