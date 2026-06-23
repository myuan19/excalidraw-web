import React, { useCallback, useEffect, useState } from "react";

import {
  listTokens,
  createToken,
  updateTokenDomains,
  deleteToken,
  buildIframeSnippet,
  buildEmbedUrl,
  type EmbedToken,
} from "../data/embedApi";
import { useStrictOverlayDismiss } from "../hooks/useStrictOverlayDismiss";
import {
  requestDestructiveConfirm,
  type DestructiveConfirmOptions,
} from "../shell/shellConfirm";

import "./EmbedTokenManager.scss";

interface Props {
  fileId: string;
  fileName: string;
  open: boolean;
  onClose: () => void;
  confirmDestructive?: (options: DestructiveConfirmOptions) => Promise<boolean>;
}

export const EmbedTokenManager: React.FC<Props> = ({
  fileId,
  fileName,
  open,
  onClose,
  confirmDestructive = requestDestructiveConfirm,
}) => {
  const [tokens, setTokens] = useState<EmbedToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDomains, setEditingDomains] = useState("*");
  const [savingId, setSavingId] = useState<string | null>(null);

  const [newDomains, setNewDomains] = useState("*");

  const overlayDismiss = useStrictOverlayDismiss(onClose);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const list = await listTokens(fileId);
      setTokens(list);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    if (open) {
      void refresh();
    }
  }, [open, refresh]);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      await createToken({
        file_id: fileId,
        allowed_domains: newDomains.trim() || "*",
      });
      setShowCreate(false);
      setNewDomains("*");
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }, [fileId, newDomains, refresh]);

  const startEditDomains = useCallback((token: EmbedToken) => {
    setEditingId(token.id);
    setEditingDomains(token.allowed_domains || "*");
  }, []);

  const cancelEditDomains = useCallback(() => {
    setEditingId(null);
    setEditingDomains("*");
  }, []);

  const saveEditDomains = useCallback(
    async (id: string) => {
      setSavingId(id);
      setError(null);
      try {
        await updateTokenDomains(id, editingDomains.trim() || "*");
        setEditingId(null);
        setEditingDomains("*");
        await refresh();
      } catch (e: any) {
        setError(e.message);
      } finally {
        setSavingId(null);
      }
    },
    [editingDomains, refresh],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const confirmed = await confirmDestructive({
        title: "删除嵌入令牌",
        message: "确定删除此嵌入令牌？删除后已嵌入的页面将无法加载。",
        confirmLabel: "删除",
      });
      if (!confirmed) {
        return;
      }
      try {
        await deleteToken(id);
        await refresh();
      } catch (e: any) {
        setError(e.message);
      }
    },
    [confirmDestructive, refresh],
  );

  const copyToClipboard = useCallback(async (text: string, tokenId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(tokenId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopiedId(tokenId);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }, []);

  if (!open) {
    return null;
  }

  return (
    <>
      <div
        className="embed-mgr__overlay"
        role="dialog"
        aria-modal
        {...overlayDismiss}
      >
      <div
        className="embed-mgr__card"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="embed-mgr__header">
          <h2 className="embed-mgr__title">嵌入管理</h2>
          <span className="embed-mgr__file-name" title={fileName}>
            {fileName}
          </span>
          <button
            type="button"
            className="embed-mgr__close"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        {error && <div className="embed-mgr__error">{error}</div>}

        <div className="embed-mgr__body">
          {loading ? (
            <div className="embed-mgr__loading">加载中…</div>
          ) : (
            <>
              {tokens.length === 0 && !showCreate && (
                <div className="embed-mgr__empty">
                  <p>还没有嵌入令牌</p>
                  <p className="embed-mgr__empty-hint">
                    创建令牌后，可以将此画布嵌入到其他网页中
                  </p>
                </div>
              )}

              {tokens.map((t) => (
                <div key={t.id} className="embed-mgr__token-row">
                  <div className="embed-mgr__token-info">
                    {editingId === t.id ? (
                      <div className="embed-mgr__domain-editor">
                        <input
                          type="text"
                          value={editingDomains}
                          onChange={(e) => setEditingDomains(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              void saveEditDomains(t.id);
                            }
                            if (e.key === "Escape") {
                              cancelEditDomains();
                            }
                          }}
                          className="embed-mgr__input embed-mgr__domain-input"
                          autoFocus
                        />
                        <button
                          type="button"
                          className="embed-mgr__btn embed-mgr__btn--primary"
                          onClick={() => void saveEditDomains(t.id)}
                          disabled={savingId === t.id}
                        >
                          {savingId === t.id ? "保存中…" : "保存"}
                        </button>
                        <button
                          type="button"
                          className="embed-mgr__btn"
                          onClick={cancelEditDomains}
                          disabled={savingId === t.id}
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <div className="embed-mgr__token-meta">
                        <span className="embed-mgr__token-domains">
                          限制域名: {t.allowed_domains}
                        </span>
                      </div>
                    )}
                    <div className="embed-mgr__token-time">
                      创建于 {new Date(t.created_at).toLocaleString()}
                      <span className="embed-mgr__token-divider">|</span>
                      引用次数: {t.usage_count}
                    </div>
                  </div>
                  <div className="embed-mgr__token-actions">
                    <button
                      type="button"
                      className="embed-mgr__btn embed-mgr__btn--copy"
                      onClick={() =>
                        copyToClipboard(
                          buildIframeSnippet(fileId, t.token),
                          t.id,
                        )
                      }
                      title="复制 iframe 代码"
                    >
                      {copiedId === t.id ? "已复制" : "复制 iframe"}
                    </button>
                    <button
                      type="button"
                      className="embed-mgr__btn embed-mgr__btn--link"
                      onClick={() =>
                        copyToClipboard(
                          buildEmbedUrl(fileId, t.token),
                          `link-${t.id}`,
                        )
                      }
                      title="复制嵌入链接"
                    >
                      {copiedId === `link-${t.id}` ? "已复制" : "复制链接"}
                    </button>
                    <button
                      type="button"
                      className="embed-mgr__btn embed-mgr__btn--preview"
                      onClick={() =>
                        window.open(
                          buildEmbedUrl(fileId, t.token),
                          "_blank",
                        )
                      }
                      title="在新标签页预览"
                    >
                      预览
                    </button>
                    <button
                      type="button"
                      className="embed-mgr__btn"
                      onClick={() => startEditDomains(t)}
                      disabled={editingId === t.id}
                    >
                      编辑域名
                    </button>
                    <button
                      type="button"
                      className="embed-mgr__btn embed-mgr__btn--danger"
                      onClick={() => handleDelete(t.id)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}

              {showCreate && (
                <div className="embed-mgr__create-form">
                  <h3 className="embed-mgr__create-title">创建嵌入令牌</h3>
                  <label className="embed-mgr__field">
                    <span>允许嵌入的域名 <span className="embed-mgr__field-tooltip" title="填写父页面站点（如在 Notion 中嵌入则填 Notion 域名），非 excalidraw 服务本身；* 表示不限制">?</span></span>
                    <input
                      type="text"
                      value={newDomains}
                      onChange={(e) => setNewDomains(e.target.value)}
                      placeholder="* 或 example.com,blog.example.com"
                      className="embed-mgr__input"
                    />
                    <span className="embed-mgr__field-hint">
                      父页面域名，逗号分隔；* 表示不限制（链接可直接打开）
                    </span>
                  </label>
                  <div className="embed-mgr__create-actions">
                    <button
                      type="button"
                      className="embed-mgr__btn embed-mgr__btn--primary"
                      onClick={handleCreate}
                      disabled={creating}
                    >
                      {creating ? "创建中…" : "创建令牌"}
                    </button>
                    <button
                      type="button"
                      className="embed-mgr__btn"
                      onClick={() => setShowCreate(false)}
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="embed-mgr__footer">
          {!showCreate && (
            <button
              type="button"
              className="embed-mgr__btn embed-mgr__btn--primary"
              onClick={() => setShowCreate(true)}
            >
              + 创建嵌入令牌
            </button>
          )}
        </div>
      </div>
      </div>
    </>
  );
};
