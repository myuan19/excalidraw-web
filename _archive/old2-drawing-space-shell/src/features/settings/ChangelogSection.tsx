import { CHANGELOG_RELEASES } from "@/config/product";
import { useUiText } from "@/features/settings/uiText";

function ReleaseList({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="changelog-group">
      <h4 className="changelog-group-title">{title}</h4>
      <ul className="settings-bullet-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function ChangelogSection() {
  const t = useUiText();

  return (
    <div className="settings-panel">
      <header className="settings-panel-header">
        <h2 className="settings-panel-title">{t("changelogTitle")}</h2>
        <p className="settings-panel-desc">{t("changelogDesc")}</p>
      </header>

      <div className="changelog-timeline">
        {CHANGELOG_RELEASES.map((release) => (
          <article key={release.version} className="changelog-release">
            <div className="changelog-release-header">
              <h3 className="changelog-version">v{release.version}</h3>
              <time className="changelog-date" dateTime={release.date}>
                {release.date}
              </time>
            </div>
            {release.summary ? (
              <p className="changelog-summary">{release.summary}</p>
            ) : null}
            <ReleaseList title={t("changelogAdded")} items={release.added ?? []} />
            <ReleaseList title={t("changelogChanged")} items={release.changed ?? []} />
            <ReleaseList title={t("changelogFixed")} items={release.fixed ?? []} />
          </article>
        ))}
      </div>
    </div>
  );
}
