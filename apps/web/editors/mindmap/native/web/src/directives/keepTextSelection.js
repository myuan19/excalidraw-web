// v-keep-text-selection：在 mousedown 阶段阻止默认行为，
// 避免点击面板/弹层时夺走编辑器焦点、清掉正在编辑文本的选区
// （click 事件不受影响，按钮/色板等仍正常响应）。
// 需要焦点才能工作的表单控件不拦截。
const FOCUSABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"]'

function onMousedown(event) {
  const target = event.target
  if (target && target.closest && target.closest(FOCUSABLE_SELECTOR)) {
    return
  }
  event.preventDefault()
}

export default {
  bind(el) {
    el.addEventListener('mousedown', onMousedown)
  },
  unbind(el) {
    el.removeEventListener('mousedown', onMousedown)
  }
}
