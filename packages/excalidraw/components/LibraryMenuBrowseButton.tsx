import { KEYS, VERSIONS } from "@excalidraw/common";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { t } from "../i18n";

import type { ExcalidrawProps, UIAppState } from "../types";

const LibraryMenuBrowseButton = ({
  theme,
  id,
  libraryReturnUrl,
}: {
  libraryReturnUrl: ExcalidrawProps["libraryReturnUrl"];
  theme: UIAppState["theme"];
  id: string;
}) => {
  const [open, setOpen] = useState(false);
  const referrer =
    libraryReturnUrl || window.location.origin + window.location.pathname;
  const baseUrl = import.meta.env.VITE_APP_LIBRARY_URL;

  const iframeSrc =
    baseUrl &&
    `${baseUrl}?target=${encodeURIComponent(
      window.name || "_blank",
    )}&referrer=${encodeURIComponent(referrer)}&useHash=true&token=${encodeURIComponent(
      id,
    )}&theme=${encodeURIComponent(theme)}&version=${VERSIONS.excalidrawLibrary}`;

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === KEYS.ESCAPE) {
        close();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  if (!baseUrl || !iframeSrc) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="library-menu-browse-button"
        onClick={() => setOpen(true)}
      >
        {t("labels.libraries")}
      </button>
      {open &&
        createPortal(
          <div
            className="library-browse-modal"
            role="dialog"
            aria-modal="true"
            aria-label={t("labels.libraries")}
          >
            <button
              type="button"
              className="library-browse-modal__backdrop"
              aria-label={t("buttons.close")}
              onClick={close}
            />
            <div className="library-browse-modal__panel">
              <div className="library-browse-modal__head">
                <span>{t("labels.libraries")}</span>
                <div className="library-browse-modal__head-actions">
                  <a
                    className="library-browse-modal__external"
                    href={iframeSrc}
                    target="_blank"
                    rel="noreferrer"
                    title={t("library.browseOpenExternal")}
                  >
                    ↗
                  </a>
                  <button
                    type="button"
                    className="library-browse-modal__close"
                    aria-label={t("buttons.close")}
                    onClick={close}
                  >
                    ×
                  </button>
                </div>
              </div>
              <iframe
                className="library-browse-modal__iframe"
                src={iframeSrc}
                title={t("labels.libraries")}
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};

export default LibraryMenuBrowseButton;
