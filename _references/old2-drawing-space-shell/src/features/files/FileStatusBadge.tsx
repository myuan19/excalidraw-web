import { cn } from "@/lib/utils";
import {
  getFileBadge,
  getFileBadgeLabel,
  type FileBadge,
} from "@/features/files/fileBadgeState";

export function FileStatusBadge({
  fileId,
  badge: badgeProp,
  className,
  position = "top-right",
}: {
  fileId: string;
  badge?: FileBadge | null;
  className?: string;
  position?: "top-right" | "bottom-left";
}) {
  const badge = badgeProp ?? getFileBadge(fileId);
  const label = getFileBadgeLabel(badge);
  if (!label) return null;

  return (
    <span
      className={cn(
        "file-status-badge",
        badge === "temp" && "file-status-badge--temp",
        badge === "draft" && "file-status-badge--draft",
        position === "top-right" && "file-status-badge--top-right",
        position === "bottom-left" && "file-status-badge--bottom-left",
        className,
      )}
    >
      {label}
    </span>
  );
}
