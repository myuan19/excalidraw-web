import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MarkdownAdapter = {
  kind: "markdown",
  currentFormatVersion: 1,
  extensions: [".md", ".markdown"],
  mimeTypes: ["text/markdown", "text/plain"],
  createEmpty() {
    return { text: "# Untitled\n" };
  },
  async parse(input) {
    if (typeof input === "string") {
      return { text: input };
    }
    if (input && typeof input.text === "string") {
      return input;
    }
    throw new Error("unsupported markdown input");
  },
  async serialize(data) {
    return data.text;
  },
  migrate(data, fromVersion) {
    if (fromVersion !== 1) {
      throw new Error(`missing migration from ${fromVersion}`);
    }
    return data;
  },
  validate(data) {
    return Boolean(data && typeof data.text === "string");
  },
};

const registry = {
  [MarkdownAdapter.kind]: MarkdownAdapter,
};

const empty = MarkdownAdapter.createEmpty();
const parsed = await MarkdownAdapter.parse("# Hello\n");
const serialized = await MarkdownAdapter.serialize(parsed);
const document = {
  kind: MarkdownAdapter.kind,
  containerVersion: 1,
  formatVersion: MarkdownAdapter.currentFormatVersion,
  data: parsed,
};

const checks = {
  registered: registry.markdown === MarkdownAdapter,
  emptyValid: MarkdownAdapter.validate(empty),
  parsedValid: MarkdownAdapter.validate(parsed),
  serializedMatches: serialized === "# Hello\n",
  managedDocumentShape:
    document.kind === "markdown" &&
    document.containerVersion === 1 &&
    document.formatVersion === 1 &&
    document.data.text === "# Hello\n",
};

const result = {
  id: "P1-5",
  title: "第三种格式 adapter",
  conclusion: Object.values(checks).every(Boolean) ? "PASS" : "FAIL",
  checks,
  document,
  recommendation:
    "A simple non-canvas format fits the adapter abstraction. Keep editor routing separate from storage so this remains low-cost.",
};

writeFileSync(join(__dirname, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(`${result.id} ${result.conclusion}`);
