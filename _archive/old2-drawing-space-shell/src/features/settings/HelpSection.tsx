import { useState } from "react";
import { HELP_TOPICS } from "@/config/product";
import { cn } from "@/lib/utils";
import { useUiText } from "@/features/settings/uiText";

export function HelpSection() {
  const t = useUiText();
  const [openId, setOpenId] = useState<string | null>(HELP_TOPICS.at(0)?.id ?? null);

  return (
    <div className="settings-panel">
      <header className="settings-panel-header">
        <h2 className="settings-panel-title">{t("helpTitle")}</h2>
        <p className="settings-panel-desc">{t("helpDesc")}</p>
      </header>

      <div className="help-faq-list">
        {HELP_TOPICS.map((topic) => {
          const expanded = openId === topic.id;
          return (
            <div key={topic.id} className="help-faq-item">
              <button
                type="button"
                className="help-faq-question"
                aria-expanded={expanded}
                onClick={() => setOpenId(expanded ? null : topic.id)}
              >
                <span>{t(topic.questionKey)}</span>
                <span
                  className={cn(
                    "icon-[mdi--chevron-down] help-faq-chevron",
                    expanded && "help-faq-chevron--open",
                  )}
                />
              </button>
              {expanded ? (
                <div className="help-faq-answer">
                  <p>{t(topic.answerKey)}</p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
