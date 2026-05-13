type EmbedWindow = {
  open?: (
    url?: string | URL,
    target?: string,
    features?: string,
  ) => Window | object | null;
  location: {
    href: string;
  };
  top?: EmbedWindow | null;
};

type EmbedEditClickEvent = {
  preventDefault: () => void;
  stopPropagation?: () => void;
};

export const openEmbedEditUrl = (
  editUrl: string,
  win: EmbedWindow = window,
) => {
  const opened = win.open?.(editUrl, "_blank", "noopener,noreferrer");
  if (opened) {
    return true;
  }
  return false;
};

export const handleEmbedEditLinkClick = (
  event: EmbedEditClickEvent,
  editUrl: string,
  win: EmbedWindow = window,
) => {
  const opened = openEmbedEditUrl(editUrl, win);
  if (opened) {
    event.preventDefault();
    event.stopPropagation?.();
  }
  // If window.open() failed (e.g. inside Electron webview like Typora),
  // let the native <a target="_blank"> behavior proceed — the host app
  // can intercept it via setWindowOpenHandler / new-window and open in
  // the system browser.
};
