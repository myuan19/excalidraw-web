import { normalizeDocument, type ManagedDocument } from "../documentTypes";
import type { DocumentFormatAdapter } from "./types";

export type TextDocumentData = { text: string };

export const TextDocumentAdapter: DocumentFormatAdapter<TextDocumentData> = {
  kind: "text",
  currentFormatVersion: 1,
  extensions: [".txt", ".md"],
  mimeTypes: ["text/plain", "text/markdown"],

  createEmpty() {
    return { text: "" };
  },

  async parse(input) {
    if (typeof Blob !== "undefined" && input instanceof Blob) {
      return { text: await input.text() };
    }
    return this.migrate(input);
  },

  async serialize(data) {
    return data.text;
  },

  migrate(data) {
    const document = normalizeDocument(data);
    if (document?.kind === "text" && this.validate(document.data)) return document.data;
    if (this.validate(data)) return data;
    if (typeof data === "string") return { text: data };
    throw new Error("Invalid text document");
  },

  validate(data): data is TextDocumentData {
    return (
      data !== null &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      typeof (data as { text?: unknown }).text === "string"
    );
  },

  toDocument(data): ManagedDocument<TextDocumentData> {
    return { kind: "text", containerVersion: 1, formatVersion: 1, data };
  },
};
