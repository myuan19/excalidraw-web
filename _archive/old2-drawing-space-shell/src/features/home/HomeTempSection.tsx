import { FileStatusBadge } from "@/features/files/FileStatusBadge";
import { getFileBadge } from "@/features/files/fileBadgeState";
import { openEditor } from "@/features/navigation";
import { cn } from "@/lib/utils";
import type { ServerFile } from "@/types/file";
import { useFileCardThumbnail } from "./useFileCardThumbnail";

function kindIcon(kind: string) {
  if (kind === "excalidraw") return "icon-[mdi--draw]";
  if (kind === "mindmap") return "icon-[mdi--sitemap-outline]";
  return "icon-[mdi--file-document-outline]";
}

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

function HomeTempCard({ file }: { file: ServerFile }) {
  const badge = getFileBadge(file.id);
  const thumbUrl = useFileCardThumbnail(file, badge);

  return (
    <button
      type="button"
      className="home-temp-card"
      onClick={() => void openEditor({ type: "file", file })}
      title={file.name}
    >
      <span className="home-temp-card-thumb relative">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className="home-temp-card-thumb-img" />
        ) : (
          <span className={cn(kindIcon(file.kind), "home-temp-card-thumb-icon text-muted")} />
        )}
        <FileStatusBadge fileId={file.id} badge={badge} position="top-right" />
      </span>
      <span className="home-temp-card-body">
        <span className="home-temp-card-name">{file.name}</span>
        <span className="home-temp-card-meta">
          <span className="home-temp-card-time">{formatRelativeTime(file.updated_at)}</span>
        </span>
      </span>
    </button>
  );
}

export function HomeTempSection({ files }: { files: ServerFile[] }) {
  return (
    <section className="home-temp-zone" aria-label="临时内容">
      <h3 className="home-temp-zone-title">临时内容</h3>
      {files.length > 0 ? (
        <div className="home-temp-grid">
          {files.map((file) => (
            <HomeTempCard key={file.id} file={file} />
          ))}
        </div>
      ) : (
        <p className="home-temp-empty">暂无临时文件。点击上方编辑器类型即可创建，保存后将从这里移除。</p>
      )}
    </section>
  );
}
