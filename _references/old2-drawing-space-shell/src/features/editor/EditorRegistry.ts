import type { EditorAdapter, EditorMeta } from "@/types/editor";

type EditorFactory = () => EditorAdapter;

interface RegistryEntry {
  meta: EditorMeta;
  factory: EditorFactory;
}

class EditorRegistryImpl {
  private entries = new Map<string, RegistryEntry>();

  register(meta: EditorMeta, factory: EditorFactory): void {
    this.entries.set(meta.id, { meta, factory });
  }

  unregister(id: string): void {
    this.entries.delete(id);
  }

  createById(id: string): EditorAdapter | null {
    const entry = this.entries.get(id);
    return entry ? entry.factory() : null;
  }

  getByFormat(ext: string): EditorMeta | null {
    for (const { meta } of this.entries.values()) {
      if (meta.supportedFormats.includes(ext)) {
        return meta;
      }
    }
    return null;
  }

  getMetaById(id: string): EditorMeta | null {
    return this.entries.get(id)?.meta ?? null;
  }

  listAll(): EditorMeta[] {
    return Array.from(this.entries.values()).map((e) => e.meta);
  }
}

export const editorRegistry = new EditorRegistryImpl();
