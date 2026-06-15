import { getAppSettings } from "./appSettings";

import type { SaveToServerSource } from "../hooks/types";

export const CHECKPOINT_LABELS = {
  manual: "checkpoint:manual",
  interval: "checkpoint:interval",
  switch: "checkpoint:switch",
  restoreBackup: "checkpoint:restore-backup",
} as const;

export type CheckpointLabel =
  typeof CHECKPOINT_LABELS[keyof typeof CHECKPOINT_LABELS];

export type CheckpointPolicy =
  | { mode: "none" }
  | { mode: "force"; label: CheckpointLabel }
  | { mode: "interval"; intervalMinutes: number; label: CheckpointLabel };

export function isManualCheckpointSource(source: SaveToServerSource): boolean {
  return source === "toolbar" || source === "hotkey" || source === "sidebar";
}

export function resolveCheckpointPolicy(
  source: SaveToServerSource,
): CheckpointPolicy {
  if (isManualCheckpointSource(source)) {
    return { mode: "force", label: CHECKPOINT_LABELS.manual };
  }

  const intervalMinutes = getAppSettings().checkpointIntervalMin;
  if (intervalMinutes > 0) {
    return {
      mode: "interval",
      intervalMinutes,
      label: CHECKPOINT_LABELS.interval,
    };
  }

  return { mode: "none" };
}

export function isCheckpointLabel(label: string): boolean {
  return label.startsWith("checkpoint:");
}

export function getCheckpointLabelText(label: string): string {
  switch (label) {
    case CHECKPOINT_LABELS.manual:
      return "手动存档";
    case CHECKPOINT_LABELS.interval:
      return "定时存档";
    case CHECKPOINT_LABELS.switch:
      return "切换前存档";
    case CHECKPOINT_LABELS.restoreBackup:
      return "恢复前备份";
    default:
      return isCheckpointLabel(label) ? "存档" : "";
  }
}
