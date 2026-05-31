/**
 * Parse Vue/webpack lazy-chunk files referenced by mind-map app.*.js.
 */
import fs from "node:fs";
import path from "node:path";

export function findMindMapAppBundle(distJsDir) {
  if (!fs.existsSync(distJsDir)) {
    return null;
  }
  return (
    fs
      .readdirSync(distJsDir)
      .find((name) => /^app\.[a-f0-9]+\.js$/.test(name)) ?? null
  );
}

/** @returns {{ id: string, hash: string, file: string, rel: string, bytes: number }[]} */
export function listWebpackLazyChunks(distJsDir) {
  const appFile = findMindMapAppBundle(distJsDir);
  if (!appFile) {
    return [];
  }
  const source = fs.readFileSync(path.join(distJsDir, appFile), "utf8");
  return fs
    .readdirSync(distJsDir)
    .filter((name) => /^chunk-.+\.[a-f0-9]+\.js$/.test(name))
    .map((name) => {
      const matched = name.match(/^(chunk-.+)\.([a-f0-9]+)\.js$/);
      if (!matched) {
        return null;
      }
      const [, id, hash] = matched;
      const abs = path.join(distJsDir, name);
      return {
        id,
        hash,
        file: name,
        rel: `dist/js/${name}`,
        bytes: fs.statSync(abs).size,
      };
    })
    .filter(
      (chunk) =>
        chunk &&
        source.includes(chunk.id) &&
        source.includes(`"${chunk.hash}"`),
    );
}

/** Remove html-webpack-plugin ?buildHash query on already content-hashed dist assets. */
export function stripWebpackHtmlQueryHashes(html) {
  return html.replace(
    /((?:href|src)=["'])(dist\/(?:js|css)\/[^"']+?)\?([a-f0-9]{8,})(["'])/gi,
    "$1$2$4",
  );
}

/** Drop script preloads — webpack dynamic import won't match crossorigin preload credentials. */
export function stripMindMapChunkPreloads(html) {
  return html.replace(
    /\s*<link\b(?=[^>]*\brel=["']preload["'])(?=[^>]*\bhref=["']dist\/)[^>]*>\s*/gi,
    "\n",
  );
}

/** Final index.html normalization after vue build + copy. */
export function normalizeMindMapIndexHtml(html) {
  return stripMindMapChunkPreloads(stripWebpackHtmlQueryHashes(html));
}
