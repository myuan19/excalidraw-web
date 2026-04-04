/**
 * 场景与服务器元数据（文件名等）的纯函数合并，不包含 I/O。
 */

import type { ForkSceneSnapshot } from "./forkFileTypes";

/** 将服务器文件列表中的 `name` 写入 appState.name（画布标题与列表一致）。 */
export function mergeAppStateWithServerFileName(
  appState: unknown,
  serverName: string | undefined | null,
): Record<string, unknown> {
  const base =
    appState && typeof appState === "object" && !Array.isArray(appState)
      ? { ...(appState as Record<string, unknown>) }
      : {};
  if (serverName && typeof serverName === "string") {
    base.name = serverName;
  }
  return base;
}

/** 用于 hash 与服务端基线对比的快照：场景 JSON + 列表展示名写入 appState。 */
export function forkSceneSnapshotWithServerName(
  scene: ForkSceneSnapshot,
  serverName: string | undefined | null,
): ForkSceneSnapshot {
  return {
    ...scene,
    appState: mergeAppStateWithServerFileName(scene.appState, serverName),
  };
}
