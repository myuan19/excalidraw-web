import { useCallback, useEffect, useRef, useState } from "react";
import { embedDebug } from "./embedDebug";

export function useEmbedPinState() {
  const [isPinned, setIsPinned] = useState(true);
  const isPinnedRef = useRef(true);

  useEffect(() => {
    isPinnedRef.current = isPinned;
  }, [isPinned]);

  const pin = useCallback(() => {
    embedDebug("pin state: pin");
    setIsPinned(true);
  }, []);

  const unpin = useCallback(() => {
    embedDebug("pin state: unpin");
    setIsPinned(false);
  }, []);

  const togglePin = useCallback(() => {
    setIsPinned((prev) => {
      const next = !prev;
      embedDebug("pin state: toggle", { from: prev, to: next });
      return next;
    });
  }, []);

  return { isPinned, isPinnedRef, pin, unpin, togglePin };
}
