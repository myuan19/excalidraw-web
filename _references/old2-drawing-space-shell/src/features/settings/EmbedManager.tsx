import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ServerSync } from "@/services/ServerSync";
import { useFileStore } from "@/stores/fileStore";
import type { EmbedToken } from "@/types/file";

function buildEmbedUrl(fileId: string, token: string): string {
  return `${window.location.origin}/embed/${fileId}?token=${encodeURIComponent(token)}`;
}

function buildIframeCode(fileId: string, token: string): string {
  const src = buildEmbedUrl(fileId, token);
  return `<iframe src="${src}" width="100%" height="640" style="border:0;border-radius:12px;overflow:hidden" allow="clipboard-read; clipboard-write" loading="lazy"></iframe>`;
}

export interface EmbedManagerProps {
  fileId?: string;
  fileName?: string;
}

export function EmbedManager({ fileId, fileName }: EmbedManagerProps) {
  const files = useFileStore((state) => state.files);
  const loadFileTree = useFileStore((state) => state.loadFileTree);
  const [selectedFileId, setSelectedFileId] = useState(fileId ?? "");
  const [allowedDomains, setAllowedDomains] = useState("*");
  const [tokens, setTokens] = useState<EmbedToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFixedFile = !!fileId;
  const effectiveFileId = fileId ?? selectedFileId;

  const selectedFile = useMemo(
    () => files.find((file) => file.id === effectiveFileId) ?? (fileId ? { id: fileId, name: fileName ?? "当前文件" } : null),
    [effectiveFileId, fileId, fileName, files],
  );

  useEffect(() => {
    if (files.length === 0) void loadFileTree();
  }, [files.length, loadFileTree]);

  useEffect(() => {
    const firstFile = files.at(0);
    if (!isFixedFile && !selectedFileId && firstFile) setSelectedFileId(firstFile.id);
  }, [files, isFixedFile, selectedFileId]);

  async function refreshTokens(targetFileId = effectiveFileId) {
    if (!targetFileId) return;
    setLoading(true);
    setError(null);
    try {
      setTokens(await ServerSync.listEmbedTokens(targetFileId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshTokens();
  }, [effectiveFileId]);

  async function handleCreate() {
    if (!effectiveFileId) return;
    try {
      await ServerSync.createEmbedToken(effectiveFileId, allowedDomains || "*");
      await refreshTokens();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleUpdate(token: EmbedToken) {
    const next = prompt("允许的域名，多个用英文逗号分隔，* 表示不限", token.allowed_domains);
    if (next == null) return;
    await ServerSync.updateEmbedToken(token.id, next.trim() || "*");
    await refreshTokens();
  }

  async function handleDelete(token: EmbedToken) {
    if (!confirm("删除这个嵌入 Token？")) return;
    await ServerSync.deleteEmbedToken(token.id);
    await refreshTokens();
  }

  async function copyIframe(token: EmbedToken) {
    await navigator.clipboard.writeText(buildIframeCode(token.file_id, token.token));
  }

  async function copyUrl(token: EmbedToken) {
    await navigator.clipboard.writeText(buildEmbedUrl(token.file_id, token.token));
  }

  return (
    <div className="embed-manager w-full space-y-lg">
      <div className="flex flex-wrap items-center gap-md">
        <h2 className="text-lg font-semibold text-foreground">嵌入到网页</h2>
        {isFixedFile && selectedFile && (
          <span className="rounded-md bg-surface-muted px-sm py-xs text-sm text-muted">
            {selectedFile.name}
          </span>
        )}
        <div className="flex-1" />
        {!isFixedFile && (
          <Select
            value={selectedFileId}
            onChange={(event) => setSelectedFileId(event.target.value)}
            className="min-w-56"
          >
            {files.map((file) => (
              <option key={file.id} value={file.id}>
                {file.name}
              </option>
            ))}
          </Select>
        )}
        <Input
          className="w-56"
          value={allowedDomains}
          onChange={(event) => setAllowedDomains(event.target.value)}
          placeholder="允许域名，如 * 或 example.com"
        />
        <Button variant="primary" size="sm" onClick={() => void handleCreate()} disabled={!effectiveFileId}>
          <span className="icon-[mdi--plus] text-base" />
          创建
        </Button>
      </div>

      {error && <p className="rounded-md bg-danger-soft p-sm text-sm text-danger">{error}</p>}

      {loading ? (
        <div className="rounded-md border border-border bg-surface-muted px-xl py-3xl text-center text-sm text-muted">
          正在加载嵌入 Token…
        </div>
      ) : tokens.length === 0 ? (
        <div className="rounded-md border border-border bg-surface-muted px-xl py-3xl text-center text-sm text-muted">
          暂无嵌入 Token
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-surface">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center justify-between px-lg py-md">
              <div className="space-y-xs">
                <span className="text-sm font-medium text-foreground">
                  {t.token.slice(0, 8)}…
                </span>
                <span className="ml-sm text-sm text-muted">{t.allowed_domains || "不限"}</span>
                <span className="ml-sm text-xs text-muted">使用 {t.usage_count ?? 0} 次</span>
              </div>
              <div className="flex gap-xs">
                <Button
                  variant="ghost"
                  size="icon"
                  title="打开预览"
                  onClick={() => window.open(buildEmbedUrl(t.file_id, t.token), "_blank", "noopener,noreferrer")}
                >
                  <span className="icon-[mdi--open-in-new] text-base" />
                </Button>
                <Button variant="ghost" size="icon" title="复制链接" onClick={() => void copyUrl(t)}>
                  <span className="icon-[mdi--link-variant] text-base" />
                </Button>
                <Button variant="ghost" size="icon" title="复制 iframe" onClick={() => void copyIframe(t)}>
                  <span className="icon-[mdi--content-copy] text-base" />
                </Button>
                <Button variant="ghost" size="icon" title="编辑域名" onClick={() => void handleUpdate(t)}>
                  <span className="icon-[mdi--pencil-outline] text-base" />
                </Button>
                <Button variant="ghost" size="icon" title="删除" onClick={() => void handleDelete(t)}>
                  <span className="icon-[mdi--delete-outline] text-base" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
