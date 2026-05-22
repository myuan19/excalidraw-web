import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileStatusBadge } from "@/features/files/FileStatusBadge";
import { getFileBadge } from "@/features/files/fileBadgeState";
import { openEditor, navigateAppView } from "@/features/navigation";
import type { ServerFile } from "@/types/file";
import { useFileCardThumbnail } from "./useFileCardThumbnail";
import { HomeTempSection } from "./HomeTempSection";

function formatRelativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  return new Date(isoStr).toLocaleDateString("zh-CN");
}

function kindIcon(kind: string) {
  if (kind === "excalidraw") return "icon-[mdi--draw]";
  if (kind === "mindmap") return "icon-[mdi--sitemap-outline]";
  return "icon-[mdi--file-document-outline]";
}

function HomeRecentHeroPreview({ file }: { file: ServerFile }) {
  const badge = getFileBadge(file.id);
  const thumbUrl = useFileCardThumbnail(file, badge);

  return (
    <>
      {thumbUrl ? (
        <img src={thumbUrl} alt="" className="home-recent-hero-img" />
      ) : (
        <span className={cn(kindIcon(file.kind), "home-recent-hero-placeholder text-muted")} />
      )}
      <FileStatusBadge fileId={file.id} badge={badge} position="top-right" />
      <span className="home-recent-hero-hover" aria-hidden>
        点击打开
      </span>
    </>
  );
}

function HomeRecentListItem({
  file,
  active,
  onSelect,
}: {
  file: ServerFile;
  active: boolean;
  onSelect(): void;
}) {
  const badge = getFileBadge(file.id);
  const thumbUrl = useFileCardThumbnail(file, badge);

  return (
    <button
      type="button"
      className={cn("home-recent-list-item", active && "home-recent-list-item--active")}
      onClick={onSelect}
      title={file.name}
    >
      <span className="home-recent-list-thumb relative">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className="home-recent-list-thumb-img" />
        ) : (
          <span className={cn(kindIcon(file.kind), "home-recent-list-thumb-icon text-muted")} />
        )}
        <FileStatusBadge fileId={file.id} badge={badge} position="top-right" />
      </span>
      <span className="home-recent-list-time">{formatRelativeTime(file.updated_at)}</span>
    </button>
  );
}

export function HomeRecentSection({
  files,
  tempFiles,
  loading,
}: {
  files: ServerFile[];
  tempFiles: ServerFile[];
  loading: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(files.at(0)?.id ?? null);

  useEffect(() => {
    setSelectedId((current) => {
      if (files.length === 0) return null;
      if (current && files.some((f) => f.id === current)) return current;
      return files.at(0)?.id ?? null;
    });
  }, [files]);

  const selectedFile = files.find((f) => f.id === selectedId) ?? files.at(0) ?? null;

  async function handleOpen(file: ServerFile) {
    await openEditor({ type: "file", file });
  }

  return (
    <section className="home-recent-zone">
      <div className="home-recent-zone-header">
        <h2 className="home-recent-zone-title">最近打开</h2>
        {files.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            className="home-recent-view-all"
            onClick={() => navigateAppView("files")}
          >
            查看全部
          </Button>
        )}
      </div>

      {files.length > 0 && selectedFile ? (
        <div className="home-recent-split">
          <div className="home-recent-split-preview">
            <button
              type="button"
              className="home-recent-open-hero"
              onClick={() => void handleOpen(selectedFile)}
              aria-label={`打开 ${selectedFile.name}`}
            >
              <HomeRecentHeroPreview file={selectedFile} />
            </button>
          </div>

          <aside className="home-recent-split-list-panel">
            <div className="home-recent-split-list">
              {files.map((file) => (
                <HomeRecentListItem
                  key={file.id}
                  file={file}
                  active={file.id === selectedFile.id}
                  onSelect={() => setSelectedId(file.id)}
                />
              ))}
            </div>
          </aside>
        </div>
      ) : (
        <div className="home-recent-empty">
          <span className="icon-[mdi--clock-outline] home-recent-empty-icon text-muted" />
          <p className="home-recent-empty-title">还没有最近打开的文件</p>
          <p className="home-recent-empty-desc">点击上方编辑器类型即可创建临时文件并开始编辑。</p>
        </div>
      )}

      {loading && files.length === 0 && (
        <p className="home-recent-zone-loading">正在同步文件列表…</p>
      )}

      <div className="home-recent-temp-divider" role="separator" />

      <HomeTempSection files={tempFiles} />
    </section>
  );
}
