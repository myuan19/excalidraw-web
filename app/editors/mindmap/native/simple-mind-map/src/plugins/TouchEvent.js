import { getTwoPointDistance } from '../utils'

const DBG = (...args) => console.log('[DEBUG] TouchEvent |', ...args)

// 手势事件支持插件
class TouchEvent {
  //  构造函数
  constructor({ mindMap }) {
    this.mindMap = mindMap
    this.touchesNum = 0
    /** 当前单指手势是否起始于画布内；仅此时才合成 mouse/click，避免与画布外原生 click 重复 */
    this.gestureInMindMap = false
    this.singleTouchstartEvent = null
    this.clickNum = 0
    this.touchStartScaleView = null
    this.lastTouchStartPosition = null
    this.lastTouchStartDistance = 0
    this.bindEvent()
  }

  // 绑定事件
  bindEvent() {
    this.onTouchstart = this.onTouchstart.bind(this)
    this.onTouchmove = this.onTouchmove.bind(this)
    this.onTouchcancel = this.onTouchcancel.bind(this)
    this.onTouchend = this.onTouchend.bind(this)
    window.addEventListener('touchstart', this.onTouchstart, { passive: false })
    window.addEventListener('touchmove', this.onTouchmove, { passive: false })
    window.addEventListener('touchcancel', this.onTouchcancel, {
      passive: false
    })
    window.addEventListener('touchend', this.onTouchend, { passive: false })
  }

  // 解绑事件
  unBindEvent() {
    window.removeEventListener('touchstart', this.onTouchstart)
    window.removeEventListener('touchmove', this.onTouchmove)
    window.removeEventListener('touchcancel', this.onTouchcancel)
    window.removeEventListener('touchend', this.onTouchend)
  }

  // 手指按下事件
  onTouchstart(e) {
    this.touchesNum = e.touches.length
    this.touchStartScaleView = null
    if (this.touchesNum === 1) {
      let touch = e.touches[0]
      this.gestureInMindMap = this.isInMindMap(touch.target)
      if (!this.gestureInMindMap) {
        this.singleTouchstartEvent = null
        return
      }
      e.preventDefault()
      if (this.lastTouchStartPosition) {
        this.lastTouchStartDistance = getTwoPointDistance(
          this.lastTouchStartPosition.x,
          this.lastTouchStartPosition.y,
          touch.clientX,
          touch.clientY
        )
      }
      this.lastTouchStartPosition = {
        x: touch.clientX,
        y: touch.clientY
      }
      this.singleTouchstartEvent = touch
      this.dispatchMouseEvent('mousedown', touch.target, touch)
      return
    }
    this.gestureInMindMap = false
    this.singleTouchstartEvent = null
  }

  // 手指移动事件
  onTouchmove(e) {
    let len = e.touches.length
    if (len === 1) {
      if (!this.gestureInMindMap) {
        return
      }
      let touch = e.touches[0]
      e.preventDefault()
      this.dispatchMouseEvent('mousemove', touch.target, touch)
    } else if (len === 2) {
      let { disableTouchZoom, minTouchZoomScale, maxTouchZoomScale } =
        this.mindMap.opt
      if (disableTouchZoom) return
      minTouchZoomScale =
        minTouchZoomScale === -1 ? -Infinity : minTouchZoomScale / 100
      maxTouchZoomScale =
        maxTouchZoomScale === -1 ? Infinity : maxTouchZoomScale / 100
      let touch1 = e.touches[0]
      let touch2 = e.touches[1]
      let ox = touch1.clientX - touch2.clientX
      let oy = touch1.clientY - touch2.clientY
      let distance = Math.sqrt(Math.pow(ox, 2) + Math.pow(oy, 2))
      // 以两指中心点进行缩放
      let { x: touch1ClientX, y: touch1ClientY } = this.mindMap.toPos(
        touch1.clientX,
        touch1.clientY
      )
      let { x: touch2ClientX, y: touch2ClientY } = this.mindMap.toPos(
        touch2.clientX,
        touch2.clientY
      )
      let cx = (touch1ClientX + touch2ClientX) / 2
      let cy = (touch1ClientY + touch2ClientY) / 2
      // 手势缩放,基于最开始的位置进行缩放(基于前一个位置缩放不是线性关系); 缩放同时支持位置拖动
      const view = this.mindMap.view
      if (!this.touchStartScaleView) {
        this.touchStartScaleView = {
          distance: distance,
          scale: view.scale,
          x: view.x,
          y: view.y,
          cx: cx,
          cy: cy
        }
        return
      }
      const viewBefore = this.touchStartScaleView
      let scale = viewBefore.scale * (distance / viewBefore.distance)
      if (Math.abs(distance - viewBefore.distance) <= 10) {
        scale = viewBefore.scale
      }
      scale =
        scale < minTouchZoomScale
          ? minTouchZoomScale
          : scale > maxTouchZoomScale
          ? maxTouchZoomScale
          : scale
      const ratio = 1 - scale / viewBefore.scale
      view.scale = scale
      view.x =
        viewBefore.x +
        (cx - viewBefore.x) * ratio +
        (cx - viewBefore.cx) * scale
      view.y =
        viewBefore.y +
        (cy - viewBefore.y) * ratio +
        (cy - viewBefore.cy) * scale
      view.transform()
      this.mindMap.emit('scale', scale)
    }
  }

  // 手指取消事件
  onTouchcancel(e) {}

  // 手指松开事件
  onTouchend(e) {
    const touch = e.changedTouches && e.changedTouches[0]
    const shouldSynthesize = this.touchesNum === 1 && this.gestureInMindMap
    if (shouldSynthesize) {
      e.preventDefault()
      this.dispatchMouseEvent('mouseup', touch ? touch.target : e.target, touch)
      // 模拟双击事件
      this.clickNum++
      setTimeout(() => {
        this.clickNum = 0
        this.lastTouchStartPosition = null
        this.lastTouchStartDistance = 0
      }, 300)
      let ev = this.singleTouchstartEvent
      const releaseDistance =
        touch && ev
          ? getTwoPointDistance(ev.clientX, ev.clientY, touch.clientX, touch.clientY)
          : 0
      if (this.clickNum > 1 && this.lastTouchStartDistance <= 5) {
        this.clickNum = 0
        DBG('touchend -> dblclick | client:', ev.clientX, ev.clientY)
        this.dispatchMouseEvent('dblclick', ev.target, ev)
      } else if (ev && releaseDistance <= 5) {
        DBG('touchend -> click | client:', ev.clientX, ev.clientY)
        this.dispatchMouseEvent('click', ev.target, ev)
      } else {
        DBG('touchend | skip click after move | distance:', releaseDistance)
      }
    }
    this.touchesNum = 0
    this.gestureInMindMap = false
    this.singleTouchstartEvent = null
    this.touchStartScaleView = null
  }

  // 发送鼠标事件
  dispatchMouseEvent(eventName, target, e) {
    if (!target) return
    let opt = {}
    if (e) {
      opt = {
        screenX: e.screenX,
        screenY: e.screenY,
        clientX: e.clientX,
        clientY: e.clientY,
        button: 0,
        buttons: eventName === 'mouseup' ? 0 : 1,
        which: 1
      }
    }
    let event = new MouseEvent(eventName, {
      view: document.defaultView,
      bubbles: true,
      cancelable: true,
      ...opt
    })
    try {
      Object.defineProperty(event, '__smmTouchSynthetic', {
        value: true
      })
    } catch (err) {
      DBG('dispatchMouseEvent | mark synthetic failed:', err)
    }
    target.dispatchEvent(event)
  }

  isInMindMap(target) {
    return !!(
      target &&
      this.mindMap &&
      this.mindMap.el &&
      this.mindMap.el.contains(target)
    )
  }

  // 插件被移除前做的事情
  beforePluginRemove() {
    this.unBindEvent()
  }

  // 插件被卸载前做的事情
  beforePluginDestroy() {
    this.unBindEvent()
  }
}

TouchEvent.instanceName = 'touchEvent'

export default TouchEvent
