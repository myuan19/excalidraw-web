import type { ManagedDocument } from "../documentTypes";
import type { DocumentFormatAdapter } from "./types";

const TEXT_FORMAT_VERSION = 1;
const CONTAINER_VERSION = 1;

export type TextDocumentData = {
  text: string;
};

export const TextAdapter: DocumentFormatAdapter<TextDocumentData> = {
  kind: "text",
  currentFormatVersion: TEXT_FORMAT_VERSION,
  extensions: [".txt"],
  mimeTypes: ["text/plain"],

  createEmpty(): TextDocumentData {
    return { text: "" };
  },

  async parse(input: Blob | unknown): Promise<TextDocumentData> {
    if (typeof Blob !== "undefined" && input instanceof Blob) {
      return { text: await input.text() };
    }
    return this.migrate(input, 1);
  },

  async serialize(data: TextDocumentData): Promise<string> {
    return data.text;
  },

  migrate(data: unknown): TextDocumentData {
    if (this.validate(data)) {
      return data;
    }
    if (typeof data === "string") {
      return { text: data };
    }
    throw new Error("Invalid text document");
  },

  validate(data: unknown): data is TextDocumentData {
    return (
      data !== null &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      typeof (data as { text?: unknown }).text === "string"
    );
  },

  toDocument(data: TextDocumentData): ManagedDocument<TextDocumentData> {
    return {
      kind: "text",
      containerVersion: CONTAINER_VERSION,
      formatVersion: TEXT_FORMAT_VERSION,
      data,
    };
  },
};
