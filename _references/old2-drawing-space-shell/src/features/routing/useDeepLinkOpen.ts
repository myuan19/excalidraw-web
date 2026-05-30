import { useEffect, useRef } from "react";
import { openEditor } from "@/features/navigation";
import { useFileStore } from "@/stores/fileStore";
import { getFileIdFromLocation } from "./fileDeepLink";

export function useDeepLinkOpen() {
  const loadFileTree = useFileStore((state) => state.loadFileTree);
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    const fileId = getFileIdFromLocation();
    if (!fileId || handledRef.current === fileId) return;
    handledRef.current = fileId;

    void (async () => {
      try {
        await loadFileTree();
        await openEditor({
          type: "fileId",
          fileId,
          options: {
            confirmChoice: (message) => confirm(message),
          },
        });
      } catch (error) {
        console.error("Failed to open file from URL", error);
        handledRef.current = null;
      }
    })();
  }, [loadFileTree]);
}
