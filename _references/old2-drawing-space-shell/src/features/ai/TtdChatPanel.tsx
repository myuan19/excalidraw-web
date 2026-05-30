import { useCallback, useEffect, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { emitAppNotice } from "@/features/ui/appNotice";
import { insertMermaidResponseToCanvas } from "./insertMermaidToCanvas";
import { TTDPersistence } from "./ttdPersistence";

type TtdMessage = { role?: string; content?: string };
type TtdChat = {
  id?: string;
  updatedAt?: number;
  messages?: TtdMessage[];
};

export function TtdChatPanel({
  excalidrawAPI,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}) {
  const [open, setOpen] = useState(false);
  const [chats, setChats] = useState<TtdChat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const loaded = await TTDPersistence.loadChats();
    const list = Array.isArray(loaded) ? loaded as TtdChat[] : [];
    setChats(list);
    setActiveId((current) => current ?? list.at(0)?.id ?? null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void refresh().finally(() => setLoading(false));
  }, [open, refresh]);

  const activeChat = chats.find((chat) => chat.id === activeId) ?? chats.at(0);
  const assistantText = activeChat?.messages?.find((m) => m.role === "assistant")?.content ?? "";

  async function handleInsert() {
    if (!excalidrawAPI || !assistantText) return;
    try {
      await insertMermaidResponseToCanvas(excalidrawAPI, assistantText);
      emitAppNotice({ level: "info", message: "已将 Mermaid 图表插入画布。" });
      setOpen(false);
    } catch (error) {
      emitAppNotice({
        level: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function handleDelete(id: string | undefined) {
    if (!id) return;
    const next = chats.filter((chat) => chat.id !== id);
    await TTDPersistence.saveChats(next);
    setChats(next);
    if (activeId === id) setActiveId(next.at(0)?.id ?? null);
  }

  return (
    <>
      <button
        type="button"
        className="ttd-chat-trigger"
        onClick={() => setOpen(true)}
      >
        {chats.length ? `AI 会话 (${chats.length})` : "AI 会话"}
      </button>
      {open && (
        <div className="ttd-chat-overlay fixed inset-0 z-overlay-panel flex items-center justify-center p-lg">
          <div
            className="ttd-chat-panel"
            role="dialog"
            aria-labelledby="ttd-chat-title"
          >
            <div className="ttd-chat-header">
              <h2 id="ttd-chat-title" className="ttd-chat-title">AI 生成历史</h2>
              <button
                type="button"
                className="ttd-chat-close"
                onClick={() => setOpen(false)}
                aria-label="关闭"
              >
                ✕
              </button>
            </div>
            <div className="ttd-chat-body">
              <aside className="ttd-chat-sidebar">
                {loading && <p className="ttd-chat-sidebar-loading">加载中…</p>}
                {chats.map((chat) => {
                  const label = chat.messages?.find((m) => m.role === "user")?.content ?? "未命名";
                  return (
                    <button
                      key={chat.id}
                      type="button"
                      className={cn(
                        "ttd-chat-sidebar-item",
                        chat.id === activeId && "ttd-chat-sidebar-item--active",
                      )}
                      title={label}
                      onClick={() => setActiveId(chat.id ?? null)}
                    >
                      {label}
                    </button>
                  );
                })}
              </aside>
              <div className="ttd-chat-main">
                {activeChat ? (
                  <div className="ttd-chat-messages">
                    {activeChat.messages?.map((message, index) => (
                      <div
                        key={index}
                        className={cn(
                          "ttd-chat-message",
                          message.role === "user"
                            ? "ttd-chat-message--user"
                            : "ttd-chat-message--assistant",
                        )}
                      >
                        <p className="ttd-chat-message-role">
                          {message.role === "user" ? "提示词" : "回复"}
                        </p>
                        <pre className="ttd-chat-message-content">{message.content}</pre>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="ttd-chat-empty">暂无会话记录。</p>
                )}
                <div className="ttd-chat-actions">
                  <Button
                    disabled={!excalidrawAPI || !assistantText}
                    onClick={() => void handleInsert()}
                  >
                    插入到画布
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!activeChat?.id}
                    onClick={() => void handleDelete(activeChat?.id)}
                  >
                    删除当前会话
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
