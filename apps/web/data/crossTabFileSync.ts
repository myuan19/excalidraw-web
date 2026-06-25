// Cross-tab file events shared by file lists and active editors.

const CHANNEL_NAME = "editorhub-sync";

type SyncMessage = {
  type: "file-saved";
  fileId: string;
  /** 服务器返回的 content_sha256，接收端用于「同一版本不重复提示」 */
  contentSha256?: string | null;
  /** 服务器返回的 document version，接收端用于绑定远程提示目标 */
  version?: number | null;
  timestamp: number;
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
  detail?:
    | string
    | null
    | {
        contentSha256?: string | null;
        version?: number | null;
      },
): void {
  const contentSha256 =
    typeof detail === "object" && detail !== null
      ? detail.contentSha256
      : detail;
  const version =
    typeof detail === "object" && detail !== null ? detail.version : null;
  try {
    getChannel()?.postMessage({
      type: "file-saved",
      fileId,
      contentSha256: contentSha256 ?? null,
      version: version ?? null,
      timestamp: Date.now(),
    } satisfies SyncMessage);
  } catch {
    // BroadcastChannel may be unavailable or closed.
  }
}

export function onCrossTabFileSaved(
  callback: (
    fileId: string,
    contentSha256: string | null,
    version?: number | null,
  ) => void,
): () => void {
  const ch = getChannel();
  if (!ch) {
    return () => {};
  }
  const handler = (event: MessageEvent<SyncMessage>) => {
    if (event.data?.type === "file-saved" && event.data.fileId) {
      callback(
        event.data.fileId,
        event.data.contentSha256 ?? null,
        event.data.version ?? null,
      );
    }
  };
  ch.addEventListener("message", handler);
  return () => ch.removeEventListener("message", handler);
}
