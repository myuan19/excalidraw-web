import type { DocumentKind, ManagedDocument } from "../documentTypes";

export interface DocumentFormatAdapter<TData = unknown> {
  kind: DocumentKind;
  currentFormatVersion: number;
  extensions: string[];
  mimeTypes: string[];
  createEmpty(): TData;
  parse(input: Blob | unknown): Promise<TData>;
  serialize(data: TData): Promise<string | object>;
  migrate(data: unknown, fromVersion?: number): TData;
  validate(data: unknown): data is TData;
  toDocument(data: TData): ManagedDocument<TData>;
}
