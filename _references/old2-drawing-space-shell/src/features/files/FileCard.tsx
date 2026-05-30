import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  chooseFileCardThumbnail,
  fetchThumbnailSvgForCard,
  LocalThumbnailCache,
  patchThumbnailSvgForCard,
  ServerThumbnailCache,
  svgToObjectUrl,
} from "@/features/thumbnail";
import { FileStatusBadge } from "@/features/files/FileStatusBadge";
import type { ServerFile, SyncState } from "@/types/file";

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

export interface FileCardProps {
  file: ServerFile;
  syncState?: SyncState;
  searchQuery?: string;
  onOpen(file: ServerFile): void;
  onRename(file: ServerFile): void;
  onMove(file: ServerFile): void;
  onEmbed(file: ServerFile): void;
  onDownload(file: ServerFile): void;
  onDelete(file: ServerFile): void;
  showActions?: boolean;
}

export function FileCard({
  file,
  syncState,
  searchQuery = "",
  onOpen,
  onRename,
  onMove,
  onEmbed,
  onDownload,
  onDelete,
  showActions = true,
}: FileCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const node = cardRef.current;
    if (!node || !file.has_thumbnail) {
      setThumbUrl(null);
      return undefined;
    }

    const load = async () => {
      const localThumb = LocalThumbnailCache.get(file.id);
      const cachedThumb = ServerThumbnailCache.get(file.id, file.content_sha256);
      const fetched = cachedThumb
        ? { svg: cachedThumb }
        : await fetchThumbnailSvgForCard(
          `/api/files/${file.id}/thumbnail${file.content_sha256 ? `?h=${file.content_sha256}` : ""}`,
        );
      if (cancelled) return;
      ServerThumbnailCache.set(file.id, file.content_sha256, fetched.svg);
      const choice = chooseFileCardThumbnail({
        syncState,
        localThumb,
        fetchedThumb: fetched.svg,
      });
      const displaySvg = choice.thumbSvg && file.kind === "mindmap"
        ? patchThumbnailSvgForCard(choice.thumbSvg)
        : choice.thumbSvg;
      objectUrl = displaySvg ? svgToObjectUrl(displaySvg) : null;
      setThumbUrl(objectUrl);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          observer.disconnect();
          void load();
        }
      },
      { rootMargin: "240px" },
    );
    observer.observe(node);

    return () => {
      cancelled = true;
      observer.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.content_sha256, file.has_thumbnail, file.id, syncState]);

  return (
    <div
      ref={cardRef}
      className="file-card group cursor-pointer overflow-hidden bg-surface transition-colors hover:border-accent/30 hover:bg-surface-muted"
      onClick={() => onOpen(file)}
    >
      <div className="file-card-thumbnail relative w-full overflow-hidden bg-surface-muted">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={file.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span
              className={cn(
                "text-3xl text-muted",
                file.kind === "excalidraw" && "icon-[mdi--draw]",
                file.kind === "mindmap" && "icon-[mdi--sitemap-outline]",
                file.kind !== "excalidraw" &&
                  file.kind !== "mindmap" &&
                  "icon-[mdi--file-document-outline]",
              )}
            />
          </div>
        )}

        <FileStatusBadge fileId={file.id} position="top-right" />

        {showActions && (
        <div className="file-card-actions absolute inset-x-0 bottom-0 flex translate-y-full items-center justify-center gap-xs p-sm transition-transform group-hover:translate-y-0">
          <ActionButton
            icon="icon-[mdi--pencil-outline]"
            title="重命名"
            onClick={(e) => {
              e.stopPropagation();
              onRename(file);
            }}
          />
          <ActionButton
            icon="icon-[mdi--folder-move-outline]"
            title="移动"
            onClick={(e) => {
              e.stopPropagation();
              onMove(file);
            }}
          />
          <ActionButton
            icon="icon-[mdi--code-tags]"
            title="嵌入到网页"
            onClick={(e) => {
              e.stopPropagation();
              onEmbed(file);
            }}
          />
          <ActionButton
            icon="icon-[mdi--download-outline]"
            title="下载"
            onClick={(e) => {
              e.stopPropagation();
              onDownload(file);
            }}
          />
          <ActionButton
            icon="icon-[mdi--delete-outline]"
            title="删除"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(file);
            }}
            danger
          />
        </div>
        )}
      </div>

      <div className="px-md py-sm">
        <p className="file-card-name truncate text-foreground">
          {highlightText(file.name, searchQuery)}
        </p>
        <div className="mt-xs flex items-center gap-sm">
          <span className="file-card-meta text-muted">
            {formatRelativeTime(file.updated_at)}
          </span>
          {file.archive_count > 0 && (
            <span className="file-card-archive-badge bg-surface-muted px-xs text-muted">
              {file.archive_count} 存档
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function highlightText(value: string, query: string): ReactNode {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return value;
  const index = value.toLowerCase().indexOf(normalizedQuery.toLowerCase());
  if (index < 0) return value;
  const before = value.slice(0, index);
  const match = value.slice(index, index + normalizedQuery.length);
  const after = value.slice(index + normalizedQuery.length);
  return (
    <>
      {before}
      <mark className="file-card-search-hit">{match}</mark>
      {after}
    </>
  );
}

interface ActionButtonProps {
  icon: string;
  title: string;
  onClick(e: React.MouseEvent): void;
  danger?: boolean;
}

function ActionButton({ icon, title, onClick, danger }: ActionButtonProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "file-card-action-button flex h-8 w-8 items-center justify-center transition-colors",
        danger && "file-card-action-button-danger",
      )}
    >
      <span className={cn(icon, "text-base")} />
    </button>
  );
}
