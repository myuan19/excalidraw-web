import {
  fetchCheckpointCoverage,
  needsRestoreBackupOffer,
} from "./checkpointContentStatus";

export async function confirmBeforeRestoreCheckpoint(opts: {
  fileId: string;
  saveCurrentAsCheckpoint: () => Promise<boolean>;
}): Promise<boolean> {
  if (
    !window.confirm(
      "将切换到选中的 checkpoint，当前 latest 会被该历史版本替换。是否继续？",
    )
  ) {
    return false;
  }

  let shouldOfferCheckpoint = false;
  try {
    const coverage = await fetchCheckpointCoverage(opts.fileId);
    shouldOfferCheckpoint = needsRestoreBackupOffer(coverage);
  } catch {
    shouldOfferCheckpoint = false;
  }

  if (!shouldOfferCheckpoint) {
    return true;
  }

  const shouldSaveCheckpoint = window.confirm(
    "当前内容可能尚未保存为 checkpoint。是否先创建 checkpoint 再切换？\n\n确定：创建 checkpoint 并继续\n取消：不创建，继续切换",
  );
  if (!shouldSaveCheckpoint) {
    return true;
  }

  const saved = await opts.saveCurrentAsCheckpoint();
  if (!saved) {
    alert("创建 checkpoint 失败，已取消切换。");
    return false;
  }
  return true;
}
