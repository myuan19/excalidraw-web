import clsx from "clsx";

import LibraryMenuBrowseButton from "./LibraryMenuBrowseButton";

import type { ExcalidrawProps, UIAppState } from "../types";

export const LibraryMenuControlButtons = ({
  libraryReturnUrl,
  theme,
  id,
  style,
  children,
  className,
  prepend,
}: {
  libraryReturnUrl: ExcalidrawProps["libraryReturnUrl"];
  theme: UIAppState["theme"];
  id: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  className?: string;
  prepend?: React.ReactNode;
}) => {
  return (
    <div
      className={clsx("lib-footer", className)}
      style={style}
    >
      {prepend}
      <LibraryMenuBrowseButton
        id={id}
        libraryReturnUrl={libraryReturnUrl}
        theme={theme}
      />
      {children}
    </div>
  );
};
