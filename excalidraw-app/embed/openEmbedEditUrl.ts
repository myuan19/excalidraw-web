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

  let topWindow: EmbedWindow | null = null;
  try {
    topWindow = win.top && win.top !== win ? win.top : null;
  } catch {
    topWindow = null;
  }

  try {
    (topWindow ?? win).location.href = editUrl;
  } catch {
    win.location.href = editUrl;
  }

  return false;
};

export const handleEmbedEditLinkClick = (
  event: EmbedEditClickEvent,
  editUrl: string,
  win: EmbedWindow = window,
) => {
  event.preventDefault();
  event.stopPropagation?.();
  openEmbedEditUrl(editUrl, win);
};
