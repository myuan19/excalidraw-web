import { ServerSync } from "./ServerSync";
import { CHECKPOINT_LABELS } from "./checkpointPolicy";

export async function maybeCreateCheckpointBeforeLeave(
  fileId: string,
): Promise<void> {
  try {
    const status = await ServerSync.getCheckpointStatus(fileId);
    if (status.hasCurrentCheckpoint) {
      return;
    }
  } catch {
    return;
  }

  const shouldCreate = window.confirm(
    "当前最新状态还没有存档。是否在切换前先创建一个 checkpoint？\n\n确定：创建存档并继续\n取消：不存档，继续切换",
  );
  if (!shouldCreate) {
    return;
  }

  try {
    await ServerSync.createCheckpoint(fileId, CHECKPOINT_LABELS.switch);
    window.dispatchEvent(new CustomEvent("excalidraw-server-saved"));
  } catch (e: any) {
    alert(`创建切换前存档失败，将继续切换：${e?.message ?? String(e)}`);
  }
}
