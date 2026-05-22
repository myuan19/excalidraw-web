import { postClientLog } from "@/features/logging/clientLogger";

const env = (import.meta as unknown as { env?: Record<string, string | boolean> }).env;
const ENABLED =
  env?.DEV === true ||
  (typeof window !== "undefined" &&
    window.localStorage.getItem("drawing-space-mindmap-debug") === "1");

function serializePayload(data: unknown) {
  if (data instanceof Error) {
    return { name: data.name, message: data.message, stack: data.stack };
  }
  try {
    return JSON.parse(JSON.stringify(data ?? null));
  } catch {
    return { value: String(data) };
  }
}

export function mindMapDebugLog(phase: string, data?: unknown) {
  if (!ENABLED) return;
  const payload = data === undefined ? undefined : serializePayload(data);
  console.debug(`[MindMapHost] ${phase}`, payload ?? "");
  void postClientLog({
    level: phase.includes("error") ? "error" : "info",
    msg: `mindmap:${phase}`,
    data: payload,
  });
}

export function describeMindMapView(view: unknown) {
  if (!view || typeof view !== "object") {
    return { valid: false, reason: "missing-or-not-object" };
  }
  const record = view as Record<string, unknown>;
  const hasState = !!record.state && typeof record.state === "object";
  const hasTransform = !!record.transform && typeof record.transform === "object";
  return {
    valid: hasState && hasTransform,
    keys: Object.keys(record),
    hasState,
    hasTransform,
    scale: hasState ? (record.state as Record<string, unknown>).scale : undefined,
  };
}
