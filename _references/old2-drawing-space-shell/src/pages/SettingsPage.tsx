import { useState } from "react";
import { AIConfigSection } from "@/features/settings/AIConfigSection";
import { AppearanceSection } from "@/features/settings/AppearanceSection";
import { AboutSection } from "@/features/settings/AboutSection";
import { ChangelogSection } from "@/features/settings/ChangelogSection";
import { EmbedManager } from "@/features/settings/EmbedManager";
import { HelpSection } from "@/features/settings/HelpSection";
import { useUiText, type UiTextKey } from "@/features/settings/uiText";
import { cn } from "@/lib/utils";

type SettingsTab = "ai" | "appearance" | "embed" | "help" | "changelog" | "about";

const tabs: { id: SettingsTab; labelKey: UiTextKey; icon: string }[] = [
  { id: "ai", labelKey: "aiConfig", icon: "icon-[mdi--robot-outline]" },
  { id: "appearance", labelKey: "appearance", icon: "icon-[mdi--palette-outline]" },
  { id: "embed", labelKey: "embedManage", icon: "icon-[mdi--code-tags]" },
  { id: "help", labelKey: "help", icon: "icon-[mdi--help-circle-outline]" },
  { id: "changelog", labelKey: "changelog", icon: "icon-[mdi--history]" },
  { id: "about", labelKey: "about", icon: "icon-[mdi--information-outline]" },
];

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("ai");
  const t = useUiText();

  return (
    <div className="app-page-shell min-h-screen w-full">
      <header className="mb-xl">
        <h1 className="m-0 text-2xl font-semibold tracking-tight">{t("settings")}</h1>
      </header>

      <div className="mb-xl flex w-full flex-wrap gap-xs border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "settings-tab flex items-center gap-sm border-b-2 px-lg py-md text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-foreground",
            )}
          >
            <span className={cn(tab.icon, "settings-tab-icon")} />
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      <div className="settings-content w-full">
        {activeTab === "ai" && <AIConfigSection />}
        {activeTab === "appearance" && <AppearanceSection />}
        {activeTab === "embed" && <EmbedManager />}
        {activeTab === "help" && <HelpSection />}
        {activeTab === "changelog" && <ChangelogSection />}
        {activeTab === "about" && <AboutSection />}
      </div>
    </div>
  );
}
