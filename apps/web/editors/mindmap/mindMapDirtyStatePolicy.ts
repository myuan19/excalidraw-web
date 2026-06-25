export function shouldSuppressMindMapDirtyState({
  hydrating,
  userEdit,
}: {
  hydrating: boolean;
  userEdit: boolean;
}): boolean {
  return hydrating && !userEdit;
}

export function isMindMapDirtyStateUserEdit(payload: unknown): boolean {
  return (
    !!payload &&
    typeof payload === "object" &&
    (payload as { userEdit?: unknown }).userEdit === true
  );
}
