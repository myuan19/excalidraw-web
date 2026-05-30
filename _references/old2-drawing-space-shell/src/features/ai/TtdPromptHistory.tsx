import { useEffect, useState } from "react";
import { TTDPersistence } from "./ttdPersistence";

type TtdChatEntry = {
  id?: string;
  updatedAt?: number;
  messages?: Array<{ role?: string; content?: string }>;
};

export function TtdPromptHistory() {
  const [entries, setEntries] = useState<TtdChatEntry[]>([]);

  useEffect(() => {
    void TTDPersistence.loadChats().then((chats) => {
      setEntries(Array.isArray(chats) ? chats as TtdChatEntry[] : []);
    });
  }, []);

  if (!entries.length) return null;

  return (
    <details className="ttd-prompt-history ml-sm text-xs text-muted">
      <summary>最近 AI 提示词</summary>
      <ul className="m-0 max-h-32 list-none overflow-auto p-sm">
        {entries.slice(0, 8).map((entry, index) => {
          const prompt = entry.messages?.find((message) => message.role === "user")?.content;
          if (!prompt) return null;
          return (
            <li key={entry.id ?? index} className="truncate py-xs" title={prompt}>
              {prompt}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
