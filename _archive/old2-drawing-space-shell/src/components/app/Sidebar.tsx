import { type AppView, useAppStore } from "@/stores/appStore";
import { useEditorStore } from "@/stores/editorStore";
import { cn } from "@/lib/utils";
import { navigateAppView, showEditorView } from "@/features/navigation";
import { getFileBadge } from "@/features/files/fileBadgeState";
import { isLocalTempFileId } from "@/features/tempFiles/tempFileId";
import { useUiText, type UiTextKey } from "@/features/settings/uiText";
import { editorDebugLog } from "@/features/logging/editorDebugLog";

interface NavItem {
  view: AppView;
  labelKey: UiTextKey;
  icon: string;
}

const browseNavItems: NavItem[] = [
  { view: "files", labelKey: "fileManager", icon: "icon-[mdi--folder-outline]" },
  { view: "settings", labelKey: "settings", icon: "icon-[mdi--cog-outline]" },
  { view: "users", labelKey: "users", icon: "icon-[mdi--account-group-outline]" },
];

function SidebarIconButton({
  label,
  icon,
  active,
  disabled,
  onClick,
  title,
}: {
  label: string;
  icon: string;
  active?: boolean;
  disabled?: boolean;
  onClick(): void;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title ?? label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "sidebar-icon-button flex w-full flex-col items-center justify-center gap-xs py-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "bg-accent-soft text-accent"
          : "text-muted hover:bg-surface-muted hover:text-foreground",
      )}
    >
      <span className={cn(icon, "text-xl leading-none")} />
      <span className="sidebar-icon-label">{label}</span>
    </button>
  );
}

export function Sidebar() {
  const activeView = useAppStore((s) => s.activeView);
  const activeFile = useEditorStore((s) => s.activeFile);
  const saving = useEditorStore((s) => s.saving);
  const t = useUiText();
  const badge = activeFile ? getFileBadge(activeFile.id) : "synced";
  const editorActive = activeView === "editor";
  const homeActive = activeView === "home";
  const editorActionsEnabled = editorActive && !!activeFile;
  const embedHistoryEnabled = editorActionsEnabled && activeFile && !isLocalTempFileId(activeFile.id);

  function requestView(nextView: AppView) {
    navigateAppView(nextView);
  }

  function handleEditorNav() {
    editorDebugLog("Sidebar.handleEditorNav", {
      activeView,
      hasActiveFile: !!activeFile,
      fileId: activeFile?.id ?? null,
      fileKind: activeFile?.kind ?? null,
    });
    showEditorView();
  }

  function openHistory() {
    if (!embedHistoryEnabled) return;
    window.dispatchEvent(new Event("mindmap-host-open-history"));
  }

  function openEmbed() {
    if (!embedHistoryEnabled) return;
    window.dispatchEvent(new Event("mindmap-host-open-embed"));
  }

  function requestSave() {
    window.dispatchEvent(new Event("mindmap-host-request-save"));
  }

  const saveTitle = activeFile
    ? badge === "temp"
      ? `${activeFile.name} · 临时（保存后同步）`
      : badge === "draft"
        ? `${activeFile.name} · 未保存`
        : `${activeFile.name} · 已同步`
    : "保存";

  return (
    <aside className="app-sidebar fixed left-0 top-0 z-40 flex h-screen w-sidebar flex-col items-stretch bg-surface py-lg">
      <button
        type="button"
        className="sidebar-logo mx-auto mb-md flex h-10 w-10 shrink-0 items-center justify-center bg-primary text-primary-foreground"
        aria-label="绘图空间"
        onClick={() => void requestView("home")}
      >
        <span className="icon-[mdi--draw] sidebar-logo-icon" />
      </button>

      <div className="flex w-full flex-col">
        <SidebarIconButton
          label="主页"
          icon="icon-[mdi--home-outline]"
          active={homeActive}
          onClick={() => void requestView("home")}
        />
        <SidebarIconButton
          label={t("editor")}
          icon="icon-[mdi--square-edit-outline]"
          active={editorActive}
          onClick={handleEditorNav}
        />

        <div className="editor-sidebar-actions flex w-full flex-col">
          <SidebarIconButton
            label={saving ? "保存中" : "保存"}
            icon="icon-[mdi--content-save-outline]"
            disabled={!editorActionsEnabled || saving}
            onClick={requestSave}
            title={saveTitle}
          />
          <SidebarIconButton
            label="嵌入"
            icon="icon-[mdi--code-tags]"
            disabled={!embedHistoryEnabled}
            onClick={openEmbed}
            title={embedHistoryEnabled ? "嵌入" : "保存后可嵌入"}
          />
          <SidebarIconButton
            label="历史"
            icon="icon-[mdi--history]"
            disabled={!embedHistoryEnabled}
            onClick={openHistory}
            title={embedHistoryEnabled ? "历史" : "保存后可查看历史"}
          />
        </div>
      </div>

      <div className="app-sidebar-divider mx-auto my-sm h-px w-10 bg-border" />

      <nav className="flex w-full flex-1 flex-col">
        {browseNavItems.map((item) => (
          <SidebarIconButton
            key={item.view}
            label={t(item.labelKey)}
            icon={item.icon}
            active={activeView === item.view}
            onClick={() => void requestView(item.view)}
          />
        ))}
      </nav>

      <div className="mt-auto flex w-full flex-col items-center px-sm">
        <button
          type="button"
          title="访客"
          aria-label="访客"
          className="sidebar-avatar flex h-10 w-10 items-center justify-center bg-surface-muted text-muted transition-colors hover:text-foreground"
          onClick={() => void requestView("settings")}
        >
          <span className="icon-[mdi--account-outline] sidebar-avatar-icon" />
        </button>
      </div>
    </aside>
  );
}
