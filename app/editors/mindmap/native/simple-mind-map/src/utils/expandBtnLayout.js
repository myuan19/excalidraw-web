/** Pixels to extend the hit area along the branch line behind the expand button. */
export function getExpandBtnHitExtend(opt) {
  const n = Number(opt?.expandBtnHitExtend)
  return Number.isFinite(n) && n > 0 ? n : 16
}

/** Width of the always-present hover/click strip (button + rear extend). */
export function getExpandBtnStripWidth(expandBtnSize, opt) {
  return expandBtnSize + getExpandBtnHitExtend(opt)
}
