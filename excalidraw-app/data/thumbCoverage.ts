/**
 * 缩略图拉取准入范围：可见卡片 ∪ 「当前作用域排序列表」前 N 条（首屏不依赖 IO 下一轮）。
 */

export const THUMB_PREFETCH_FIRST_N = 30;

/** 合并：IntersectionObserver 可见 id + scope 排序前 prefetchFirstN 个文件 id（去重）。 */
export function computeThumbFetchAllowIds(
  visibleThumbIds: ReadonlySet<string>,
  scopeFilesOrdered: readonly { id: string }[],
  prefetchFirstN: number = THUMB_PREFETCH_FIRST_N,
): Set<string> {
  const next = new Set<string>(visibleThumbIds);
  const limit = Math.min(prefetchFirstN, scopeFilesOrdered.length);
  for (let i = 0; i < limit; i++) {
    next.add(scopeFilesOrdered[i].id);
  }
  return next;
}
