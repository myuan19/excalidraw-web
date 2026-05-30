import { type SelectHTMLAttributes } from "react";
import { cn } from "../cn";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

export function Select({ className, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        "h-9 rounded-md border border-border bg-surface px-md text-sm text-foreground outline-none focus:border-accent",
        className,
      )}
      {...props}
    />
  );
}
