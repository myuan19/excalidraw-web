import type { ManagedDocument } from "../documentTypes";

export interface DocumentFormatAdapter<TData = unknown> {
  kind: string;
  extensions: string[];
  mimeTypes: string[];
  createEmpty: (name?: string) => TData;
  validate: (value: unknown) => value is TData;
  migrate?: (input: unknown, targetFormatVersion?: number) => TData;
  toDocument: (data: TData) => ManagedDocument<TData>;
  serialize: (data: TData) => unknown | Promise<unknown>;
  parse: (raw: unknown) => TData;
}
