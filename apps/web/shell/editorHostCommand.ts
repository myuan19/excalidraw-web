export const EDITOR_HOST_COMMAND_EVENT = "editor-host-command";

export type EditorHostCommandName =
  | "save"
  | "export"
  | "import"
  | "history"
  | "embed";

export type EditorHostCommandDetail = {
  command: EditorHostCommandName;
  requestId: string;
};

let fallbackSequence = 0;

export function createEditorHostCommandId(
  command: EditorHostCommandName,
): string {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${fallbackSequence++}`;
  return `${command}:${randomId}`;
}

export function dispatchEditorHostCommand(
  command: EditorHostCommandName,
): void {
  window.dispatchEvent(
    new CustomEvent<EditorHostCommandDetail>(EDITOR_HOST_COMMAND_EVENT, {
      detail: {
        command,
        requestId: createEditorHostCommandId(command),
      },
    }),
  );
}

export function getEditorHostCommandDetail(
  event: Event,
): EditorHostCommandDetail | null {
  const detail = (event as CustomEvent<EditorHostCommandDetail>).detail;
  if (
    !detail ||
    typeof detail.requestId !== "string" ||
    (detail.command !== "save" &&
      detail.command !== "export" &&
      detail.command !== "import" &&
      detail.command !== "history" &&
      detail.command !== "embed")
  ) {
    return null;
  }
  return detail;
}
