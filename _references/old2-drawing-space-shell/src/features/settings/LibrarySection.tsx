import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { tagLibraryItemWithAI } from "@/features/library/libraryItemIconTag";
import { emitAppNotice } from "@/features/ui/appNotice";
import { ServerSync } from "@/services/ServerSync";
import { useSettingsStore } from "@/stores/settingsStore";
import type { AIConfig, LibraryGroup, LibraryItem } from "@/types/file";

export function LibrarySection() {
  const aiConfig = useSettingsStore((state) => state.aiConfig.excalidraw);
  const [publicItems, setPublicItems] = useState<LibraryItem[]>([]);
  const [personalItems, setPersonalItems] = useState<LibraryItem[]>([]);
  const [groups, setGroups] = useState<LibraryGroup[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [nextPublic, nextPersonal, nextGroups] = await Promise.all([
        ServerSync.listPublicLibraryItems(),
        ServerSync.listPersonalLibraryItems(),
        ServerSync.listLibraryGroups(),
      ]);
      setPublicItems(nextPublic);
      setPersonalItems(nextPersonal);
      setGroups(nextGroups);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <section className="dialog-panel library-panel w-full bg-surface p-xl">
      <div className="mb-lg flex items-center gap-md">
        <div>
          <h2 className="library-title">素材库</h2>
          <p className="settings-copy text-muted">
            查看服务端 public / personal / group 素材数据，后续 Excalidraw 素材面板会复用这里的同步源。
          </p>
        </div>
        <div className="flex-1" />
        <Button variant="secondary" onClick={() => void refresh()} disabled={loading}>
          {loading ? "刷新中…" : "刷新"}
        </Button>
      </div>

      {error && <p className="archive-error bg-danger-soft p-sm text-danger">{error}</p>}

      <div className="grid gap-md md:grid-cols-3">
        <LibraryStat title="公共素材" count={publicItems.length} />
        <LibraryStat title="个人素材" count={personalItems.length} />
        <LibraryStat title="分组" count={groups.length} />
      </div>

      {groups.length > 0 && (
        <div className="mt-lg">
          <p className="archive-title mb-sm">分组</p>
          <div className="grid gap-sm">
            {groups.map((group) => (
              <div key={group.id} className="library-group-card">
                <button
                  type="button"
                  className="library-group-header flex w-full items-center justify-between px-md py-sm text-left"
                  onClick={() => setCollapsedGroups((state) => ({
                    ...state,
                    [group.id]: !state[group.id],
                  }))}
                >
                  <span className="library-group-name">{group.name}</span>
                  <span className="text-muted">{group.itemIds.length} 项</span>
                </button>
                {!collapsedGroups[group.id] && (
                  <p className="archive-meta px-md pb-sm text-muted">
                    {group.itemIds.join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-lg grid gap-md md:grid-cols-2">
        <LibraryList title="公共素材" items={publicItems} aiConfig={aiConfig} />
        <LibraryList title="个人素材" items={personalItems} aiConfig={aiConfig} />
      </div>
    </section>
  );
}

function LibraryStat({ title, count }: { title: string; count: number }) {
  return (
    <div className="library-stat-card bg-surface-muted p-md">
      <p className="archive-meta text-muted">{title}</p>
      <p className="library-stat-count">{count}</p>
    </div>
  );
}

function LibraryList({
  title,
  items,
  aiConfig,
}: {
  title: string;
  items: LibraryItem[];
  aiConfig: AIConfig["excalidraw"];
}) {
  return (
    <div className="archive-list overflow-hidden">
      <p className="archive-title library-list-title px-md py-sm">{title}</p>
      {items.length === 0 ? (
        <p className="archive-message p-md text-muted">暂无素材。</p>
      ) : (
        items.slice(0, 8).map((item) => (
          <div key={item.id} className="archive-row flex items-center justify-between gap-sm px-md py-sm last:border-b-0">
            <div className="min-w-0">
              <p className="archive-title truncate">{item.name || "未命名素材"}</p>
              <p className="archive-meta text-muted">
                {new Date(item.created_at).toLocaleString("zh-CN")}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "image/*";
                input.onchange = () => {
                  const file = input.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    void tagLibraryItemWithAI(item, aiConfig, String(reader.result ?? ""))
                      .then((tag) => emitAppNotice({ level: "info", message: `AI 标签：${tag}` }))
                      .catch((err) => emitAppNotice({
                        level: "error",
                        message: err instanceof Error ? err.message : String(err),
                      }));
                  };
                  reader.readAsDataURL(file);
                };
                input.click();
              }}
            >
              AI 打标
            </Button>
          </div>
        ))
      )}
    </div>
  );
}
