// Cross-tab file events shared by file lists and active editors.
import { createLogger } from "../lib/logger";

import { getClientTabId } from "./clientRequestContext";

const CHANNEL_NAME = "editorhub-sync";
const log = createLogger({ module: "crossTabSync" });

type SyncMessage = {
  type: "file-saved";
  fileId: string;
  /** 服务器返回的 content_sha256，接收端用于「同一版本不重复提示」 */
  contentSha256?: string | null;
  /** 服务器返回的整数版本，接收端用于绑定提示目标 */
  version?: number | null;
  timestamp: number;
  senderTabId?: string | null;
};

export type CrossTabFileSavedPayload = {
  fileId: string;
  contentSha256: string | null;
  version: number | null;
};

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") {
    return null;
  }
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return channel;
}

export function broadcastFileSaved(
  fileId: string,
  saved?:
    | string
    | null
    | { contentSha256?: string | null; version?: number | null },
): void {
  try {
    const contentSha256 =
      typeof saved === "string" || saved === null || saved === undefined
        ? saved ?? null
        : saved.contentSha256 ?? null;
    const version =
      typeof saved === "object" && saved !== null
        ? saved.version ?? null
        : null;
    const senderTabId = getClientTabId();
    log.info("broadcast file-saved", {
      clientTabId: senderTabId,
      fileId8: fileId.slice(0, 8),
      sha8: contentSha256?.slice(0, 8) ?? null,
      version,
    });
    const message: SyncMessage = {
      type: "file-saved",
      fileId,
      contentSha256: contentSha256 ?? null,
      version,
      timestamp: Date.now(),
      senderTabId,
    };
    getChannel()?.postMessage(message);
  } catch (error) {
    log.warn("broadcast failed", {
      clientTabId: getClientTabId(),
      fileId8: fileId.slice(0, 8),
      message: error instanceof Error ? error.message : String(error),
    });
    // BroadcastChannel may be unavailable or closed.
  }
}

export function onCrossTabFileSaved(
  callback: (
    fileId: string,
    contentSha256: string | null,
    payload: CrossTabFileSavedPayload,
  ) => void,
): () => void {
  const ch = getChannel();
  if (!ch) {
    return () => {};
  }
  const handler = (event: MessageEvent<SyncMessage>) => {
    if (event.data?.type === "file-saved" && event.data.fileId) {
      log.info("received file-saved", {
        clientTabId: getClientTabId(),
        senderTabId: event.data.senderTabId ?? null,
        fileId8: event.data.fileId.slice(0, 8),
        sha8: event.data.contentSha256?.slice(0, 8) ?? null,
        version: event.data.version ?? null,
        ageMs: Date.now() - event.data.timestamp,
      });
      callback(event.data.fileId, event.data.contentSha256 ?? null, {
        fileId: event.data.fileId,
        contentSha256: event.data.contentSha256 ?? null,
        version: event.data.version ?? null,
      });
    }
  };
  ch.addEventListener("message", handler);
  return () => ch.removeEventListener("message", handler);
}
