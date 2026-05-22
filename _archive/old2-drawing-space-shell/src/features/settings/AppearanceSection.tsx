import { useSettingsStore, type ThemeMode } from "@/stores/settingsStore";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useUiText } from "./uiText";

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: string }[] = [
  { value: "light", label: "浅色", icon: "icon-[mdi--white-balance-sunny]" },
  { value: "dark", label: "深色", icon: "icon-[mdi--weather-night]" },
  { value: "system", label: "跟随系统", icon: "icon-[mdi--laptop]" },
];

export function AppearanceSection() {
  const theme = useSettingsStore((s) => s.theme);
  const language = useSettingsStore((s) => s.language);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const t = useUiText();

  return (
    <div className="space-y-xl">
      <Card>
        <CardHeader>
          <CardTitle>{t("theme")}</CardTitle>
        </CardHeader>
        <div className="flex gap-sm">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTheme(opt.value)}
              className={cn(
                "flex flex-1 flex-col items-center gap-xs rounded-md border px-lg py-md text-sm font-medium transition-colors",
                theme === opt.value
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border bg-surface text-muted hover:bg-surface-muted hover:text-foreground",
              )}
            >
              <span className={cn("text-xl", opt.icon)} />
              {t(opt.value)}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("language")}</CardTitle>
        </CardHeader>
        <Select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          <option value="zh-CN">简体中文</option>
          <option value="en">English</option>
        </Select>
      </Card>

      <p className="settings-hint text-muted">
        {t("localPreferenceHint")}
      </p>
    </div>
  );
}
