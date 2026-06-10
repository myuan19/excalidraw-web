// Cross-tab file events shared by file lists and active editors.

const CHANNEL_NAME = "editorhub-sync";

type SyncMessage = {
  type: "file-saved";
  fileId: string;
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

export function broadcastFileSaved(fileId: string): void {
  try {
    getChannel()?.postMessage({
      type: "file-saved",
      fileId,
      timestamp: Date.now(),
    } satisfies SyncMessage);
  } catch {
    // BroadcastChannel may be unavailable or closed.
  }
}

export function onCrossTabFileSaved(
  callback: (fileId: string) => void,
): () => void {
  const ch = getChannel();
  if (!ch) {
    return () => {};
  }
  const handler = (event: MessageEvent<SyncMessage>) => {
    if (event.data?.type === "file-saved" && event.data.fileId) {
      callback(event.data.fileId);
    }
  };
  ch.addEventListener("message", handler);
  return () => ch.removeEventListener("message", handler);
}
