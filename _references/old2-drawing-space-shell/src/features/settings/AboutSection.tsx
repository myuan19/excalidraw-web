import { APP_NAME, APP_NAME_ZH, APP_VERSION } from "@/config/product";
import { useUiText } from "@/features/settings/uiText";

export function AboutSection() {
  const t = useUiText();

  return (
    <div className="settings-panel">
      <header className="settings-panel-header">
        <h2 className="settings-panel-title">{t("aboutTitle")}</h2>
        <p className="settings-panel-desc">{t("aboutDesc")}</p>
      </header>

      <dl className="settings-meta-list">
        <div className="settings-meta-row">
          <dt>{t("aboutProductName")}</dt>
          <dd>{APP_NAME} / {APP_NAME_ZH}</dd>
        </div>
        <div className="settings-meta-row">
          <dt>{t("aboutVersionLabel")}</dt>
          <dd>v{APP_VERSION}</dd>
        </div>
        <div className="settings-meta-row">
          <dt>{t("aboutStorage")}</dt>
          <dd>{t("aboutStorageValue")}</dd>
        </div>
        <div className="settings-meta-row">
          <dt>{t("aboutEditors")}</dt>
          <dd>{t("aboutEditorsValue")}</dd>
        </div>
      </dl>

      <section className="settings-panel-block">
        <h3 className="settings-panel-subtitle">{t("aboutBoundaryTitle")}</h3>
        <ul className="settings-bullet-list">
          <li>{t("aboutBoundary1")}</li>
          <li>{t("aboutBoundary2")}</li>
          <li>{t("aboutBoundary3")}</li>
        </ul>
      </section>

      <section className="settings-panel-block">
        <h3 className="settings-panel-subtitle">{t("aboutCreditsTitle")}</h3>
        <p className="settings-panel-desc">{t("aboutCredits")}</p>
      </section>
    </div>
  );
}
