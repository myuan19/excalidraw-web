export interface TTDPersistenceAdapter {
  load?: () => unknown;
  save?: (value: unknown) => unknown;
}

export interface SavedChat {
  id: string;
  title?: string;
  messages?: unknown[];
}

export type SavedChats = SavedChat[];
