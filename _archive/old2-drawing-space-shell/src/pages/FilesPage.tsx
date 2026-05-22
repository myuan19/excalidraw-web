import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useFileStore, getDescendantFolderIds } from "@/stores/fileStore";
import { FileListSidebar } from "@/features/files/FileListSidebar";
import { FolderTree } from "@/features/files/FolderTree";
import { FileCard } from "@/features/files/FileCard";
import { downloadDocument } from "@/features/files/downloadDocument";
import { MoveFileDialog } from "@/features/files/MoveFileDialog";
import { PathBar } from "@/features/files/PathBar";
import { EmbedManager } from "@/features/settings/EmbedManager";
import { useUiText } from "@/features/settings/uiText";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ServerSync } from "@/services/ServerSync";
import { importDocumentFile } from "@/features/import";
import { openEditor } from "@/features/navigation";
import { requestNewFromFiles } from "@/features/files/startNewTempFile";
import { FileSyncState, prefetchMindMapNativeAssets } from "@/features/sync";
import { useThumbnailPipeline } from "@/features/thumbnail";
import type { ServerFile, SortBy } from "@/types/file";

export function FilesPage() {
  const files = useFileStore((s) => s.files);
  const folders = useFileStore((s) => s.folders);
  const currentFolderId = useFileStore((s) => s.currentFolderId);
  const searchQuery = useFileStore((s) => s.searchQuery);
  const sortBy = useFileStore((s) => s.sortBy);
  const sortDir = useFileStore((s) => s.sortDir);
  const loading = useFileStore((s) => s.loading);
  const error = useFileStore((s) => s.error);
  const loadFileTree = useFileStore((s) => s.loadFileTree);
  const setSearchQuery = useFileStore((s) => s.setSearchQuery);
  const setSortBy = useFileStore((s) => s.setSortBy);
  const setSortDir = useFileStore((s) => s.setSortDir);
  const removeFile = useFileStore((s) => s.removeFile);
  const renameFile = useFileStore((s) => s.renameFile);
  const moveFileTo = useFileStore((s) => s.moveFile);
  const t = useUiText();

  const [moveFile, setMoveFile] = useState<ServerFile | null>(null);
  const [embedFile, setEmbedFile] = useState<ServerFile | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [folderDrawerOpen, setFolderDrawerOpen] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    fileName: string;
  } | null>(null);
  const [, setSyncVersion] = useState(0);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadFileTree();
    void prefetchMindMapNativeAssets();
  }, [loadFileTree]);

  useEffect(() => {
    void ServerSync.listFileHashes()
      .then((hashes) => FileSyncState.markServerHashes(hashes))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const onChange = () => setSyncVersion((version) => version + 1);
    window.addEventListener("file-sync-state-change", onChange);
    return () => window.removeEventListener("file-sync-state-change", onChange);
  }, []);

  const descendantIds = useMemo(
    () => (currentFolderId ? getDescendantFolderIds(folders, currentFolderId) : new Set<string>()),
    [folders, currentFolderId],
  );

  const filteredFiles = useMemo(() => {
    let result = files;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((f) => f.name.toLowerCase().includes(q));
    } else if (currentFolderId !== null) {
      result = result.filter(
        (f) => f.folder_id === currentFolderId || descendantIds.has(f.folder_id as string),
      );
    }

    return [...result].sort((a, b) => {
      let av: string, bv: string;
      switch (sortBy) {
        case "name": av = a.name; bv = b.name; break;
        case "createdAt": av = a.created_at; bv = b.created_at; break;
        default: av = a.updated_at; bv = b.updated_at;
      }
      const result = av.localeCompare(bv);
      return sortDir === "asc" ? result : -result;
    });
  }, [files, currentFolderId, searchQuery, sortBy, sortDir, descendantIds]);
  useThumbnailPipeline(filteredFiles);

  async function handleOpen(file: ServerFile) {
    await openEditor({ type: "file", file });
  }

  async function handleRename(file: ServerFile) {
    const newName = prompt("新文件名", file.name);
    if (newName?.trim() && newName !== file.name) {
      await renameFile(file.id, newName.trim());
    }
  }

  async function handleDelete(file: ServerFile) {
    if (confirm(`确定删除「${file.name}」？`)) {
      await removeFile(file.id);
    }
  }

  async function handleDownload(file: ServerFile) {
    try {
      await downloadDocument(file);
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleMove(folderId: string | null) {
    if (moveFile) {
      await moveFileTo(moveFile.id, folderId);
      setMoveFile(null);
    }
  }

  async function handleImport(files: FileList | null) {
    if (!files?.length) return;
    const failures: string[] = [];
    const importFiles = Array.from(files);
    setImportProgress({ current: 0, total: importFiles.length, fileName: importFiles.at(0)?.name ?? "" });
    const createdInBatch: string[] = [];
    try {
      for (const [index, file] of importFiles.entries()) {
        setImportProgress({ current: index + 1, total: importFiles.length, fileName: file.name });
        try {
          const created = await importDocumentFile(file, currentFolderId);
          createdInBatch.push(created.id);
        } catch (error) {
          failures.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
          if (importFiles.length > 1) {
            await Promise.all(createdInBatch.map((id) => ServerSync.deleteFile(id).catch(() => undefined)));
            createdInBatch.length = 0;
          }
        }
      }
    } finally {
      setImportProgress(null);
    }
    await loadFileTree();
    if (importInputRef.current) {
      importInputRef.current.value = "";
    }
    if (failures.length) {
      alert(`部分文件导入失败：\n${failures.join("\n")}`);
    }
  }

  function handleDragOver(event: DragEvent) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    setIsDraggingFiles(true);
  }

  function handleDragLeave(event: DragEvent) {
    if (event.currentTarget === event.target) {
      setIsDraggingFiles(false);
    }
  }

  function handleDrop(event: DragEvent) {
    if (!event.dataTransfer.files.length) return;
    event.preventDefault();
    setIsDraggingFiles(false);
    void handleImport(event.dataTransfer.files);
  }

  return (
    <div
      className="relative flex h-screen flex-col"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDraggingFiles && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-accent/10">
          <div className="rounded-xl border border-accent bg-surface px-2xl py-xl text-accent shadow-lg">
            松开鼠标导入到当前文件夹
          </div>
        </div>
      )}
      <header className="flex shrink-0 items-center gap-md border-b border-border px-xl pb-md pt-lg">
        <h1 className="m-0 text-lg font-semibold">{t("drawingSpace")}</h1>
        <div className="flex-1" />

        <div className="relative">
          <span className="icon-[mdi--magnify] absolute left-sm top-1/2 -translate-y-1/2 text-base text-muted" />
          <Input
            type="search"
            placeholder={t("searchFiles")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-48 pl-xl"
          />
        </div>

        <Button
          variant="secondary"
          size="sm"
          className="md:hidden"
          onClick={() => setFolderDrawerOpen(true)}
        >
          <span className="icon-[mdi--folder-outline] text-base" />
          文件夹
        </Button>

        <Select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
        >
          <option value="updatedAt">{t("updatedAt")}</option>
          <option value="createdAt">{t("createdAt")}</option>
          <option value="name">{t("name")}</option>
        </Select>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
          title="切换排序方向"
        >
          <span className={sortDir === "asc" ? "icon-[mdi--sort-ascending]" : "icon-[mdi--sort-descending]"} />
        </Button>

        <input
          ref={importInputRef}
          type="file"
          className="hidden"
          multiple
          accept=".excalidraw,.json,.smm,.png,.svg,.jpg,.jpeg,.txt,.md,application/json,image/png,image/svg+xml,image/jpeg,text/plain,text/markdown"
          onChange={(event) => void handleImport(event.target.files)}
        />

        <Button
          variant="secondary"
          size="sm"
          onClick={() => importInputRef.current?.click()}
        >
          <span className="icon-[mdi--tray-arrow-up] text-base" />
          {t("import")}
        </Button>

        <Button size="sm" onClick={requestNewFromFiles}>
          <span className="icon-[mdi--plus] text-base" />
          {t("newFile")}
        </Button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <FileListSidebar />

        <div className="flex flex-1 flex-col overflow-auto">
          <div className="border-b border-border px-xl py-sm">
            <PathBar />
          </div>
          {importProgress && (
            <div className="import-progress-banner border-b border-border bg-surface-muted px-xl py-sm text-muted">
              正在导入 {importProgress.current}/{importProgress.total}：{importProgress.fileName}
            </div>
          )}

          {filteredFiles.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-xl">
              <span className="icon-[mdi--folder-open-outline] text-6xl text-muted" />
              <p className="text-lg font-medium text-muted">
                {loading ? t("loadingFiles") : error ? t("fileServiceUnavailable") : t("emptyFiles")}
              </p>
              {error && <p className="max-w-md text-center text-sm text-danger">{error}</p>}
              <div className="flex gap-md">
                <Button variant="secondary" onClick={() => importInputRef.current?.click()}>
                  <span className="icon-[mdi--tray-arrow-up] text-base" />
                  {t("importFile")}
                </Button>
                <Button onClick={requestNewFromFiles}>
                  <span className="icon-[mdi--plus] text-base" />
                  {t("createFirstFile")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="file-grid">
              {filteredFiles.map((file) => (
                <FileCard
                  key={file.id}
                  file={file}
                  syncState={FileSyncState.getSyncState(file.id)}
                  searchQuery={searchQuery}
                  onOpen={handleOpen}
                  onRename={handleRename}
                  onMove={setMoveFile}
                  onEmbed={setEmbedFile}
                  onDownload={handleDownload}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <MoveFileDialog
        open={!!moveFile}
        onClose={() => setMoveFile(null)}
        file={moveFile}
        onMove={handleMove}
      />
      <Dialog open={!!embedFile} onClose={() => setEmbedFile(null)} size="xl">
        <EmbedManager
          fileId={embedFile?.id}
          fileName={embedFile?.name}
        />
      </Dialog>
      <Dialog open={folderDrawerOpen} onClose={() => setFolderDrawerOpen(false)} size="md">
        <div className="mobile-folder-dialog flex flex-col gap-md">
          <h2 className="m-0 text-lg font-semibold">文件夹</h2>
          <div className="mobile-folder-tree overflow-auto">
            <FolderTree />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
