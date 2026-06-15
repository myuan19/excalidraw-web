import {
  handleEmbedEditLinkClick,
  openEmbedEditUrl,
} from "./openEmbedEditUrl";

describe("openEmbedEditUrl", () => {
  it("opens the edit URL in a new window when the host allows popups", () => {
    const openedWindow = {};
    const win = {
      open: vi.fn(() => openedWindow),
      location: { href: "" },
      top: null,
    };

    expect(openEmbedEditUrl("https://example.com/#file=1", win as any)).toBe(true);
    expect(win.open).toHaveBeenCalledWith(
      "https://example.com/#file=1",
      "_blank",
      "noopener,noreferrer",
    );
    expect(win.location.href).toBe("");
  });

  it("falls back to top-level navigation when popup opening is blocked", () => {
    const topWindow = {
      location: { href: "" },
    };
    const win = {
      open: vi.fn(() => null),
      location: { href: "" },
      top: topWindow,
    };

    expect(openEmbedEditUrl("https://example.com/#file=1", win as any)).toBe(false);
    expect(topWindow.location.href).toBe("https://example.com/#file=1");
    expect(win.location.href).toBe("");
  });

  it("falls back to current frame navigation when top-level navigation is unavailable", () => {
    const win = {
      open: vi.fn(() => null),
      location: { href: "" },
      top: null,
    };

    expect(openEmbedEditUrl("https://example.com/#file=1", win as any)).toBe(false);
    expect(win.location.href).toBe("https://example.com/#file=1");
  });

  it("handles link clicks through the popup fallback path", () => {
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    const win = {
      open: vi.fn(() => null),
      location: { href: "" },
      top: null,
    };

    handleEmbedEditLinkClick(event, "https://example.com/#file=1", win as any);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(win.location.href).toBe("https://example.com/#file=1");
  });
});
