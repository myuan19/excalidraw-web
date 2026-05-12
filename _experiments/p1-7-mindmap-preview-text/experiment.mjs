import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function decodeXmlEntities(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function htmlToPlainText(value) {
  return decodeXmlEntities(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function escapeXmlText(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeTextNodes(svg) {
  return svg.replace(/(<text\b[^>]*>)([\s\S]*?)(<\/text>)/gi, (_m, open, text, close) => {
    const plain = htmlToPlainText(text);
    return `${open}${escapeXmlText(plain)}${close}`;
  });
}

const before =
  '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="288" viewBox="0 0 512 288"><rect width="512" height="288" rx="18" fill="#f8f9fa"/><circle cx="206" cy="52" r="34" fill="#4c6ef5"/><text x="206" y="57" text-anchor="middle" font-size="14" font-family="system-ui, sans-serif" fill="#fff">&lt;p&gt;vibe coding&lt;/p&gt;</text><rect x="296" y="92" width="150" height="28" rx="14" fill="#edf2ff" stroke="#bac8ff"/><text x="371" y="111" text-anchor="middle" font-size="12" fill="#364fc7">&lt;p&gt;写网页&lt;/p&gt;</text><rect x="296" y="160" width="150" height="28" rx="14" fill="#edf2ff" stroke="#bac8ff"/><text x="371" y="179" text-anchor="middle" font-size="12" fill="#364fc7">&lt;p&gt;写后端&lt;/p&gt;</text></svg>';
const after = normalizeTextNodes(before);

const beforeText = [...before.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)].map(
  (m) => m[1],
);
const afterText = [...after.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)].map(
  (m) => m[1],
);

writeFileSync(join(__dirname, "before.svg"), before);
writeFileSync(join(__dirname, "after.svg"), after);
writeFileSync(
  join(__dirname, "preview.html"),
  `<!doctype html><meta charset="utf-8"><style>body{font-family:sans-serif;display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:20px;background:#eee}section{background:white;padding:12px;border-radius:8px}svg{width:100%;border:1px solid #ddd}</style><section><h2>Before</h2>${before}</section><section><h2>After</h2>${after}</section>`,
);

const checks = {
  beforeHasEscapedHtmlTags: beforeText.some((x) => /&lt;\/?\w+/i.test(x)),
  afterHasEscapedHtmlTags: afterText.some((x) => /&lt;\/?\w+/i.test(x)),
  afterContainsPlainChinese: afterText.includes("写网页") && afterText.includes("写后端"),
  afterRootText: afterText[0],
  beforeText,
  afterText,
};

const result = {
  id: "P1-7",
  title: "MindMap preview text normalization",
  conclusion:
    checks.beforeHasEscapedHtmlTags &&
    !checks.afterHasEscapedHtmlTags &&
    checks.afterContainsPlainChinese
      ? "PASS"
      : "FAIL",
  checks,
  outputs: ["before.svg", "after.svg", "preview.html"],
  recommendation:
    "Normalize MindMap thumbnail text nodes by decoding XML entities, converting rich-text HTML to plain text, then escaping XML text before rendering/saving.",
};

writeFileSync(join(__dirname, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(`${result.id} ${result.conclusion}`);
console.log(`before[0]=${beforeText[0]}`);
console.log(`after[0]=${afterText[0]}`);
