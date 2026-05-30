import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileSyncState } from "@/features/sync";
import { resolveHomeTempFiles } from "@/features/home/resolveHomeTempFiles";
import {
  formatEditorNameList,
  listHomeEditors,
  type HomeEditorEntry,
} from "@/features/home/listHomeEditors";
import { useUiText } from "@/features/settings/uiText";
import type { ServerFile } from "@/types/file";

function HomeStatCard({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string | number;
}) {
  return (
    <div className="home-stat-card">
      <span className={cn(icon, "home-stat-card-icon text-accent")} />
      <span className="home-stat-card-value">{value}</span>
      <span className="home-stat-card-label">{label}</span>
    </div>
  );
}

function HomeCreateCard({
  entry,
  onClick,
}: {
  entry: HomeEditorEntry;
  onClick(): void;
}) {
  return (
    <button type="button" className="home-create-card" onClick={onClick}>
      <span className={cn(entry.icon, "home-create-card-icon text-accent")} />
      <span className="home-create-card-label">{entry.label}</span>
      {entry.tagline ? (
        <span className="home-create-card-tagline">{entry.tagline}</span>
      ) : null}
    </button>
  );
}

export function HomeOverviewSection({
  files,
  recentCount,
  loading,
  onOpenFiles,
  onQuickCreate,
}: {
  files: ServerFile[];
  recentCount: number;
  loading: boolean;
  onOpenFiles(): void;
  onQuickCreate(kind: string): void;
}) {
  const homeEditors = useMemo(() => listHomeEditors(), []);
  const editorNames = useMemo(
    () => formatEditorNameList(homeEditors.map((entry) => entry.label)),
    [homeEditors],
  );
  const t = useUiText();
  const draftCount = useMemo(
    () => files.filter((file) => FileSyncState.getSyncState(file.id) === "draft").length,
    [files],
  );
  const tempCount = resolveHomeTempFiles().length;

  return (
    <section className="home-hero-zone">
      <div className="home-hero-header">
        <div>
          <p className="home-hero-eyebrow">Drawing Space</p>
          <h1 className="home-hero-title">{t("drawingSpace")}</h1>
          <p className="home-hero-desc">
            {editorNames
              ? `创建${editorNames}，统一管理草稿与版本。`
              : "在同一工作空间中管理你的绘图文件。"}
          </p>
        </div>
        <div className="home-hero-actions">
          <Button onClick={onOpenFiles}>
            <span className="icon-[mdi--folder-open-outline] home-inline-icon" />
            打开文件管理
          </Button>
        </div>
      </div>

      <div className="home-stats-grid" aria-label="工作区概览">
        <HomeStatCard
          icon="icon-[mdi--folder-multiple-outline]"
          label="全部文件"
          value={loading ? "—" : files.length}
        />
        <HomeStatCard
          icon="icon-[mdi--history]"
          label="最近打开"
          value={recentCount}
        />
        <HomeStatCard
          icon="icon-[mdi--cloud-upload-outline]"
          label="本地草稿"
          value={draftCount}
        />
        <HomeStatCard
          icon="icon-[mdi--file-clock-outline]"
          label="临时文件"
          value={tempCount}
        />
      </div>

      {homeEditors.length > 0 && (
        <div className="home-create-section">
          <p className="home-section-label">新建</p>
          <div className="home-create-grid">
            {homeEditors.map((entry) => (
              <HomeCreateCard
                key={entry.id}
                entry={entry}
                onClick={() => onQuickCreate(entry.fileKind)}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
