/**
 * 缩略图可见性：UI loading 与网络拉取均只对视口内（含 margin）卡片生效，
 * 不做「列表前 N 条」off-screen 预取 —— loading 微光只对真正在拉的卡亮，避免假占位。
 */

/** 与文件列表 IntersectionObserver 的 rootMargin 保持一致 */
export const THUMB_VISIBILITY_ROOT_MARGIN_PX = 400;

type RectLike = {
  top: number;
  left: number;
  right: number;
  bottom: number;
};

function rectsOverlap(a: RectLike, b: RectLike): boolean {
  return (
    a.bottom >= b.top &&
    a.top <= b.bottom &&
    a.right >= b.left &&
    a.left <= b.right
  );
}

function expandRect(rect: RectLike, marginPx: number): RectLike {
  return {
    top: rect.top - marginPx,
    left: rect.left - marginPx,
    right: rect.right + marginPx,
    bottom: rect.bottom + marginPx,
  };
}

/**
 * 首帧 layout 同步测量视口内（含 margin）的缩略图 id。
 * IntersectionObserver 首次回调是异步且分批的，仅靠它会让可见卡的 loading
 * 「一个个蹦出来」；用同步测量做种子，保证首屏按真实可见数量一次性进入 loading。
 */
export function measureVisibleThumbIdsInRoot(
  scrollRoot: HTMLElement | null,
  thumbNodesByFileId: ReadonlyMap<string, HTMLElement>,
  rootMarginPx: number = THUMB_VISIBILITY_ROOT_MARGIN_PX,
): Set<string> {
  const viewport: RectLike =
    typeof window !== "undefined"
      ? {
          top: 0,
          left: 0,
          right: window.innerWidth,
          bottom: window.innerHeight,
        }
      : { top: 0, left: 0, right: 0, bottom: 0 };
  const rootRect = scrollRoot?.getBoundingClientRect() ?? viewport;
  const probe = expandRect(rootRect, rootMarginPx);
  const visible = new Set<string>();
  for (const [fileId, node] of thumbNodesByFileId) {
    if (rectsOverlap(node.getBoundingClientRect(), probe)) {
      visible.add(fileId);
    }
  }
  return visible;
}

/** 网络拉取准入 = 可见集（与 UI loading 同源，无 off-screen 预取）。 */
export function computeThumbFetchAllowIds(
  visibleThumbIds: ReadonlySet<string>,
): Set<string> {
  return new Set(visibleThumbIds);
}
