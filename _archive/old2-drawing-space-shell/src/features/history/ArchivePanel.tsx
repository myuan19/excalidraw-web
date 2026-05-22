import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileSyncState } from "@/features/sync";
import { ServerSync } from "@/services/ServerSync";
import type { ArchiveEntry, ServerFile } from "@/types/file";

interface ArchivePanelProps {
  open: boolean;
  file: ServerFile | null;
  onClose(): void;
  onRestored(file: ServerFile & { data: unknown }): void;
}

export function ArchivePanel({ open, file, onClose, onRestored }: ArchivePanelProps) {
  const [archives, setArchives] = useState<ArchiveEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setSyncVersion] = useState(0);

  async function refresh() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      setArchives(await ServerSync.listArchives(file.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void refresh();
  }, [open, file?.id]);

  useEffect(() => {
    if (!open || !file) return undefined;
    const onArchivesChange = (event: Event) => {
      const fileId = (event as CustomEvent<{ fileId?: string }>).detail?.fileId;
      if (fileId === file.id) void refresh();
    };
    window.addEventListener("file-archives-change", onArchivesChange);
    return () => window.removeEventListener("file-archives-change", onArchivesChange);
  }, [open, file?.id]);

  useEffect(() => {
    if (!open) return undefined;
    const onSyncChange = () => setSyncVersion((version) => version + 1);
    window.addEventListener("file-sync-state-change", onSyncChange);
    return () => window.removeEventListener("file-sync-state-change", onSyncChange);
  }, [open]);

  async function handleRestore(archive: ArchiveEntry) {
    if (!file) return;
    if (
      FileSyncState.hasUnsavedChanges(file.id) &&
      !confirm("当前文件存在未保存草稿。恢复历史版本会清理本地草稿，是否继续？")
    ) {
      return;
    }
    if (!confirm(`恢复版本「${archive.label || archive.created_at}」？当前内容会被该版本覆盖。`)) {
      return;
    }
    await ServerSync.restoreArchive(file.id, archive.id);
    const restored = await ServerSync.getFile(file.id);
    onRestored(restored);
    await refresh();
  }

  async function handleDelete(archive: ArchiveEntry) {
    if (!file) return;
    if (!confirm("删除该历史版本？")) return;
    await ServerSync.deleteArchive(file.id, archive.id);
    await refresh();
  }

  async function handleRename(archive: ArchiveEntry) {
    if (!file) return;
    const label = prompt("历史版本标签", archive.label || "");
    if (label == null) return;
    await ServerSync.updateArchiveLabel(file.id, archive.id, label.trim());
    await refresh();
  }

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <DialogHeader>
        <DialogTitle>历史版本</DialogTitle>
        <DialogDescription>
          {file ? `查看和恢复「${file.name}」的服务端归档。` : "未打开文件。"}
        </DialogDescription>
      </DialogHeader>

      {error && <p className="archive-error bg-danger-soft p-sm text-danger">{error}</p>}

      {file && FileSyncState.hasUnsavedChanges(file.id) && (
        <p className="archive-error bg-warning-soft p-sm text-warning">
          当前文件存在本地草稿。恢复任一历史版本前会要求确认并清理该草稿。
        </p>
      )}

      <div className="archive-list max-h-96 overflow-auto">
        {loading ? (
          <p className="archive-message p-lg text-muted">正在加载历史版本…</p>
        ) : archives.length === 0 ? (
          <p className="archive-message p-lg text-muted">暂无历史版本。</p>
        ) : (
          archives.map((archive) => (
            <div
              key={archive.id}
              className="archive-row flex items-center gap-sm px-md py-sm last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="archive-title truncate">
                  {archive.label || "未命名版本"}
                </p>
                <p className="archive-meta text-muted">
                  {new Date(archive.created_at).toLocaleString("zh-CN")}
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => void handleRename(archive)}>
                标签
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void handleRestore(archive)}>
                恢复
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger hover:text-danger"
                onClick={() => void handleDelete(archive)}
              >
                删除
              </Button>
            </div>
          ))
        )}
      </div>

      <DialogFooter>
        <Button variant="secondary" onClick={() => void refresh()}>
          刷新
        </Button>
        <Button onClick={onClose}>关闭</Button>
      </DialogFooter>
    </Dialog>
  );
}
