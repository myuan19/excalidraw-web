// 全屏事件检测
const getOnfullscreEnevt = () => {
  if (document.documentElement.requestFullScreen) {
    return 'onfullscreenchange'
  } else if (document.documentElement.webkitRequestFullScreen) {
    return 'onwebkitfullscreenchange'
  } else if (document.documentElement.mozRequestFullScreen) {
    return 'onmozfullscreenchange'
  } else if (document.documentElement.msRequestFullscreen) {
    return 'onmsfullscreenchange'
  }
}

export const fullscrrenEvent = getOnfullscreEnevt()

// 全屏
export const fullScreen = element => {
  if (element.requestFullScreen) {
    element.requestFullScreen()
  } else if (element.webkitRequestFullScreen) {
    element.webkitRequestFullScreen()
  } else if (element.mozRequestFullScreen) {
    element.mozRequestFullScreen()
  }
}

// 文件转buffer
export const fileToBuffer = file => {
  return new Promise(r => {
    const reader = new FileReader()
    reader.onload = () => {
      r(reader.result)
    }
    reader.readAsArrayBuffer(file)
  })
}

// 复制文本到剪贴板
export const copy = text => {
  // 使用textarea可以保留换行
  const input = document.createElement('textarea')
  // input.setAttribute('value', text)
  input.innerHTML = text
  document.body.appendChild(input)
  input.select()
  document.execCommand('copy')
  document.body.removeChild(input)
}

// 复制文本到剪贴板
export const setDataToClipboard = data => {
  if (window.takeOverAppMethods?.writeClipboardText) {
    return window.takeOverAppMethods.writeClipboardText(data)
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(data)
  }
}

// 复制图片到剪贴板
export const setImgToClipboard = img => {
  if (window.takeOverAppMethods?.writeClipboardImage) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        window.takeOverAppMethods
          .writeClipboardImage(reader.result, img.type || 'image/png')
          .then(resolve)
          .catch(reject)
      }
      reader.onerror = error => reject(error)
      reader.readAsDataURL(img)
    })
  }
  if (navigator.clipboard && navigator.clipboard.write) {
    const data = [new ClipboardItem({ ['image/png']: img })]
    return navigator.clipboard.write(data)
  }
}

// 打印大纲
export const printOutline = el => {
  return new Promise(resolve => {
    if (!el) {
      resolve()
      return
    }

    const iframe = document.createElement('iframe')
    iframe.setAttribute(
      'style',
      'position: fixed; right: 0; bottom: 0; width: 0; height: 0; border: 0;'
    )
    document.body.appendChild(iframe)

    const win = iframe.contentWindow
    const doc = win.document
    doc.open()
    doc.write('<!DOCTYPE html><html><head><meta charset="utf-8">')

    document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
      if (link.href) {
        doc.write(`<link rel="stylesheet" href="${link.href}">`)
      }
    })
    document.querySelectorAll('style').forEach(styleEl => {
      doc.write(styleEl.outerHTML)
    })

    doc.write(
      '<style media="print">@page { size: portrait; margin: 12mm; } body { margin: 0; }</style>'
    )
    doc.write('</head><body>')
    doc.write(`<div class="outlinePrintRoot">${el.outerHTML}</div>`)
    doc.write('</body></html>')
    doc.close()

    const cleanup = () => {
      if (iframe.parentNode) {
        document.body.removeChild(iframe)
      }
      resolve()
    }

    const triggerPrint = () => {
      try {
        win.focus()
        win.print()
      } catch (error) {
        console.error(error)
        cleanup()
      }
    }

    if ('onafterprint' in win) {
      win.onafterprint = cleanup
    } else {
      setTimeout(cleanup, 1500)
    }

    setTimeout(triggerPrint, 300)
  })
}

export const getParentWithClass = (el, className) => {
  if (el.classList.contains(className)) {
    return el
  }
  if (el.parentNode && el.parentNode !== document.body) {
    return getParentWithClass(el.parentNode, className)
  }
  return null
}