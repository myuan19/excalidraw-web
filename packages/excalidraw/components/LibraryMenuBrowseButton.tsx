import { VERSIONS } from "@excalidraw/common";

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
  const referrer =
    libraryReturnUrl || window.location.origin + window.location.pathname;
  const baseUrl = import.meta.env.VITE_APP_LIBRARY_URL;

  const libraryUrl =
    baseUrl &&
    `${baseUrl}?target=${encodeURIComponent(
      window.name || "_blank",
    )}&referrer=${encodeURIComponent(referrer)}&useHash=true&token=${encodeURIComponent(
      id,
    )}&theme=${encodeURIComponent(theme)}&version=${VERSIONS.excalidrawLibrary}`;

  if (!baseUrl || !libraryUrl) {
    return null;
  }

  return (
    <a
      className="library-menu-browse-button"
      href={libraryUrl}
      target="_excalidraw_libraries"
    >
      {t("labels.libraries")}
    </a>
  );
};

export default LibraryMenuBrowseButton;
