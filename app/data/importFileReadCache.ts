const fileTextCache = new WeakMap<File, Promise<string>>();
const fileJsonCache = new WeakMap<File, Promise<unknown>>();

export function readImportFileText(file: File): Promise<string> {
  const cached = fileTextCache.get(file);
  if (cached) {
    return cached;
  }
  const promise = file.text();
  fileTextCache.set(file, promise);
  return promise;
}

export async function parseImportFileJsonMaybe(
  file: File,
): Promise<unknown | undefined> {
  const cached = fileJsonCache.get(file);
  if (cached) {
    return cached;
  }
  const promise = readImportFileText(file).then((text) => {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return undefined;
    }
  });
  fileJsonCache.set(file, promise);
  return promise;
}

export async function parseImportFileJson(file: File): Promise<unknown> {
  let parsed: unknown;
  try {
    parsed = await parseImportFileJsonMaybe(file);
  } catch {
    throw new Error("Invalid MindMap JSON");
  }
  if (parsed === undefined) {
    throw new Error("Invalid MindMap JSON");
  }
  return parsed;
}
