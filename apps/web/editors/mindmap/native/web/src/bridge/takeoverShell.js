/* MindMap iframe host-takeover runtime. Built into public/mind-map via copy.js */
(function () {
      // Must match apps/web/editors/mindmap/mindMapDraftState.ts NATIVE_HYDRATE_SETTLE_MS
      const DIRTY_NOTIFY_SETTLE_MS = 2500
      const bridgeSource = 'simple-mind-map-native'
      const hostSource = 'excalidraw-web'
      const bridgeStartedAt = performance.now()
      const isMindMapDebugEnabled = () => {
        if (window.__MINDMAP_DEBUG__ === true) return true
        try {
          if (
            window.localStorage &&
            window.localStorage.getItem('editorhub-debug-logging') === '1'
          ) {
            return true
          }
          if (/^localhost$|^127\.0\.0\.1$/.test(window.location.hostname)) {
            return true
          }
        } catch (error) {
          return false
        }
        return false
      }
      const isMindMapOperationTraceEnabled = () => {
        try {
          return (
            window.localStorage &&
            window.localStorage.getItem('editorhub-debug-logging') === '1'
          )
        } catch (error) {
          return false
        }
      }
      const mindmapLoadMark = (label, data) => {
        if (!isMindMapDebugEnabled()) return
        console.log(
          '[DEBUG] mindmap-load | iframe ' +
            label +
            ' ' +
            JSON.stringify({
              t: Math.round(performance.now()),
              sinceBridgeStart: Math.round(performance.now() - bridgeStartedAt),
              ...(data || {})
            })
        )
      }
      const debugMindMapOpen = (label, data) => {
        if (!isMindMapDebugEnabled()) return
        console.log(
          '[DEBUG] mindmap-open | iframe bridge ' +
            label +
            ' ' +
            JSON.stringify({
              t: Math.round(performance.now()),
              sinceBridgeStart: Math.round(performance.now() - bridgeStartedAt),
              ...(data || {})
            })
        )
      }
      const normalizeTraceText = text =>
        String(text || '')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      const countTraceNodes = node => {
        if (!node) return 0
        return (
          1 +
          (node.children || []).reduce(
            (sum, child) => sum + countTraceNodes(child),
            0
          )
        )
      }
      const flattenTraceNodes = (node, path = ['root'], out = []) => {
        if (!node || out.length >= 500) return out
        const children = Array.isArray(node.children) ? node.children : []
        out.push({
          path: path.join('.'),
          text: normalizeTraceText(node.data && node.data.text).slice(0, 120),
          rawTextLen: String((node.data && node.data.text) || '').length,
          richText: !!(node.data && node.data.richText === true),
          childCount: children.length
        })
        children.forEach((child, index) => {
          if (out.length < 500) {
            flattenTraceNodes(child, [...path, String(index)], out)
          }
        })
        return out
      }
      const compactTraceNode = (node, depth = 0) => {
        if (!node) return null
        const children = Array.isArray(node.children) ? node.children : []
        return {
          text: normalizeTraceText(node.data && node.data.text).slice(0, 80),
          rawTextLen: String((node.data && node.data.text) || '').length,
          richText: !!(node.data && node.data.richText === true),
          childCount: children.length,
          children:
            depth >= 2
              ? undefined
              : children.slice(0, 8).map(child => compactTraceNode(child, depth + 1)),
          truncatedChildren: Math.max(0, children.length - 8)
        }
      }
      const summarizeNativeMindMapDataForTrace = data => {
        const root = data && data.root ? data.root : null
        if (!root) return null
        const firstChildren = Array.isArray(root.children) ? root.children : []
        return {
          nodeCount: countTraceNodes(root),
          rootText: normalizeTraceText(root.data && root.data.text).slice(0, 120),
          rootRawTextLen: String((root.data && root.data.text) || '').length,
          rootChildCount: firstChildren.length,
          firstChildTexts: firstChildren
            .slice(0, 12)
            .map(child => normalizeTraceText(child.data && child.data.text).slice(0, 80)),
          compactTree: compactTraceNode(root),
          flatNodes: flattenTraceNodes(root),
          flatNodesTruncated: countTraceNodes(root) > 500
        }
      }
      const summarizeMindMapPayloadRichText = payload => {
        let sample = ''
        const root =
          payload && payload.mindMapData && payload.mindMapData.root
            ? payload.mindMapData.root
            : null
        const walk = node => {
          if (sample || !node || !node.data) return
          const text = String(node.data.text || '')
          if (text.includes('<strong') || text.includes('ql-indent-')) {
            sample = text
            return
          }
          (node.children || []).forEach(walk)
        }
        if (root) walk(root)
        return {
          sampleStrongCount: sample
            ? (sample.match(/<strong\b/gi) || []).length
            : 0,
          sampleTextLen: sample.length,
          samplePreview: sample.slice(0, 120)
        }
      }
      const debugMindMapHostForward = (scope, label, data) => {
        if (!isMindMapDebugEnabled()) return
        console.log(
          `[DEBUG] ${scope} | host ${label} ` +
            JSON.stringify({
              t: Math.round(performance.now()),
              sinceBridgeStart: Math.round(performance.now() - bridgeStartedAt),
              ...(data || {})
            })
        )
      }
      const getSlowMindMapResources = () => {
        if (!isMindMapDebugEnabled() || !performance.getEntriesByType) return []
        return performance
          .getEntriesByType('resource')
          .filter(item => /\/mind-map\/|\/dist\//.test(item.name))
          .sort((a, b) => b.duration - a.duration)
          .slice(0, 12)
          .map(item => ({
            name: item.name.split('/').slice(-2).join('/'),
            duration: Math.round(item.duration),
            transferSize: item.transferSize || 0,
            encodedBodySize: item.encodedBodySize || 0
          }))
      }
      const normalizeBridgeTheme = theme => {
        if (typeof theme === 'string' && theme.trim()) {
          return { template: theme.trim(), config: {} }
        }
        if (theme && typeof theme === 'object' && typeof theme.template === 'string') {
          return {
            template: theme.template,
            config:
              theme.config && typeof theme.config === 'object' ? theme.config : {}
          }
        }
        return { template: 'classic4', config: {} }
      }
      const normalizeBridgeMindMapData = data => {
        if (!data || typeof data !== 'object') {
          return data
        }
        return {
          ...data,
          theme: normalizeBridgeTheme(data.theme)
        }
      }
      const defaultBridgeState = {
        mindMapData: normalizeBridgeMindMapData({
          root: {
            data: {
              text: '<p>未命名</p>',
              richText: true,
              expand: true
            },
            children: []
          },
          theme: {
            template: 'classic4',
            config: {}
          },
          layout: 'logicalStructure',
          config: {},
          view: null
        }),
        mindMapConfig: {},
        lang: 'zh',
        localConfig: null,
        embedMode: false,
        readOnly: false
      }
      let bridgeState = {
        ...defaultBridgeState
      }
      let runtimeBlocked = false
      let bridgeReadySent = false
      let pendingHostAiConfig = null
      let hostAiConfigListenerReady = false
      const emitOnBus = (event, payload) => {
        if (window.$bus && typeof window.$bus.$emit === 'function') {
          window.$bus.$emit(event, payload)
          return true
        }
        return false
      }
      const describeHostAiConfig = payload => {
        return {
          configured: !!(payload && payload.configured),
          hasApi: !!(payload && payload.api),
          apiTail: payload && payload.api ? String(payload.api).slice(-32) : '',
          hasKey: !!(payload && payload.key),
          keyLen: payload && payload.key ? String(payload.key).length : 0,
          model: payload && payload.model,
          method: payload && payload.method
        }
      }
      const emitHostAiConfig = (payload, reason) => {
        debugMindMapOpen('mindMapAiConfig receive', {
          reason,
          ...describeHostAiConfig(payload),
          hasBus: !!(window.$bus && typeof window.$bus.$emit === 'function'),
          listenerReady: hostAiConfigListenerReady,
          appStarted,
          hostAppInitedSent,
          hasNativeMindMap: !!nativeMindMap
        })
        if (hostAiConfigListenerReady && emitOnBus('host_ai_config', payload)) {
          pendingHostAiConfig = null
          debugMindMapOpen('mindMapAiConfig emitted', {
            reason,
            ...describeHostAiConfig(payload)
          })
          return true
        }
        pendingHostAiConfig = payload
        debugMindMapOpen('mindMapAiConfig queued', {
          reason,
          ...describeHostAiConfig(payload),
          hasBus: !!(window.$bus && typeof window.$bus.$emit === 'function'),
          listenerReady: hostAiConfigListenerReady
        })
        return false
      }
      const flushPendingHostAiConfig = reason => {
        debugMindMapOpen('mindMapAiConfig flush pending', {
          reason,
          hasPending: !!pendingHostAiConfig,
          hasBus: !!(window.$bus && typeof window.$bus.$emit === 'function'),
          listenerReady: hostAiConfigListenerReady,
          ...(pendingHostAiConfig ? describeHostAiConfig(pendingHostAiConfig) : {})
        })
        if (!pendingHostAiConfig) return
        emitHostAiConfig(pendingHostAiConfig, reason)
      }
      const blockRuntime = (reason, payload) => {
        if (runtimeBlocked) return
        runtimeBlocked = true
        window.__mindMapRuntimeBlocked = true
        debugMindMapOpen('blockRuntime', { reason, payload })
        reportIframeFailure(
          payload || {
            kind: 'runtime-blocked',
            message:
              'MindMap 脚本未加载：请确认已部署完整的 /mind-map/dist/js/（勿仅更新 index.html）'
          }
        )
      }
      const isRuntimeReady = () =>
        !runtimeBlocked && typeof window.initApp === 'function'
      let appStarted = false
      let hostAppInitedSent = false
      let appInitedSentToHost = false
      let renderEnded = false
      let nativeMindMap = null
      let bridgeRequestSeq = 0
      let mindMapDataRevision = 0
      const DRAFT_THUMB_EXPORT_DEBOUNCE_MS = 450
      let draftThumbExportTimer = null
      let draftThumbExportRevision = 0
      let draftThumbExportWaitingIdle = false
      // 隐藏页跳过的缩略图导出待办：回到可见后补一次
      let thumbnailPendingWhileHidden = false
      // 隐藏页跳过的文本强制渲染待办：回到可见后补跑健康度检查
      let textRenderEnsurePendingWhileHidden = false
      let nativeSaveInFlight = null
      let dirtyNotifyEnabled = false
      let dirtyNotifyEnableTimer = null
      let pendingUserEditDraftMeta = null
      // [DEBUG] 记录最近一次静默窗口的来源，便于诊断被吞掉的脏通知/草稿推送
      let dirtyNotifyDisabledMeta = null
      const describeDirtyNotifyWindow = () => {
        if (!dirtyNotifyDisabledMeta) return { disableReason: null }
        return {
          disableReason: dirtyNotifyDisabledMeta.reason,
          msSinceDisabled: Math.round(
            performance.now() - dirtyNotifyDisabledMeta.at
          )
        }
      }
      const notePendingUserEditDraftMeta = reason => {
        pendingUserEditDraftMeta = {
          userEdit: true,
          reason: reason || null
        }
        traceNativeMindMapOp('pendingUserEditDraftMeta.note', {
          reason: reason || null
        })
      }
      const consumePendingUserEditDraftMeta = () => {
        const meta = pendingUserEditDraftMeta
        pendingUserEditDraftMeta = null
        return meta || { userEdit: false, reason: null }
      }
      const bridgeRequests = new Map()
      const postToHost = (type, payload) => {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(
            {
              source: bridgeSource,
              type,
              payload
            },
            '*'
          )
        }
      }
      // ===== 拖拽会话状态 =====
      // 节点拖拽（node_dragging/node_dragend）与画布平移（drag/mouseup）期间，
      // 缩略图导出、宿主发起的保存快照等重活会吃掉拖拽帧预算（iframe 与宿主
      // 同主线程），统一推迟到拖拽结束后执行；状态同步给宿主，宿主侧的
      // 空闲自动保存/草稿写盘同样让路（对应 Excalidraw 的 pointerDrag 机制）
      const DRAG_IDLE_SETTLE_MS = 240
      const DRAG_ACTIVE_SAFETY_MS = 15000
      let interactionDragActive = false
      let dragIdleWaiters = []
      let dragIdleFlushTimer = null
      let dragActiveSafetyTimer = null
      const flushDragIdleWaiters = () => {
        if (interactionDragActive) return
        const waiters = dragIdleWaiters.splice(0)
        waiters.forEach(fn => {
          try {
            fn()
          } catch (error) {
            console.warn('[mindmap-bridge] drag idle waiter failed', error)
          }
        })
      }
      const setInteractionDragActive = active => {
        if (interactionDragActive === active) return
        interactionDragActive = active
        if (dragActiveSafetyTimer) {
          window.clearTimeout(dragActiveSafetyTimer)
          dragActiveSafetyTimer = null
        }
        postToHost('mindMapInteractionState', { dragging: active })
        debugMindMapOpen('interaction drag state', {
          active,
          pendingIdleWaiters: dragIdleWaiters.length
        })
        if (active) {
          if (dragIdleFlushTimer) {
            window.clearTimeout(dragIdleFlushTimer)
            dragIdleFlushTimer = null
          }
          // 安全阀：mouseup 丢失（窗口失焦等）时不至于永久搁置重活
          dragActiveSafetyTimer = window.setTimeout(() => {
            dragActiveSafetyTimer = null
            setInteractionDragActive(false)
          }, DRAG_ACTIVE_SAFETY_MS)
          return
        }
        // 结束后留一小段冷却，让 drop 提交的渲染先落地
        dragIdleFlushTimer = window.setTimeout(() => {
          dragIdleFlushTimer = null
          flushDragIdleWaiters()
        }, DRAG_IDLE_SETTLE_MS)
      }
      const runWhenDragIdle = fn => {
        if (!interactionDragActive) {
          fn()
          return
        }
        dragIdleWaiters.push(fn)
      }
      const waitForDragIdle = (timeoutMs = 8000) => {
        return new Promise(resolve => {
          if (!interactionDragActive) {
            resolve(true)
            return
          }
          let settled = false
          const timer = window.setTimeout(() => {
            if (settled) return
            settled = true
            resolve(false)
          }, timeoutMs)
          dragIdleWaiters.push(() => {
            if (settled) return
            settled = true
            window.clearTimeout(timer)
            resolve(true)
          })
        })
      }
      // ===== 宿主 pane 前后台（编辑器标签切换，与浏览器级 document.hidden 独立）=====
      // 语义对齐 Excalidraw：离开编辑器视图 = 提交当前输入。pane 转后台时结束
      // 进行中的文本编辑（文字落进节点数据，触发 dirty → 保存链），随后的
      // 后台保存拿到的是完整数据；保存跑完黄点清空后宿主才会休眠该 pane。
      let hostPaneForeground = true
      const commitPendingTextEditForBackground = reason => {
        if (!nativeMindMap || !isTextEditVisible()) {
          return
        }
        try {
          const textEdit = nativeMindMap.renderer.textEdit
          if (textEdit && typeof textEdit.hideEditTextBox === 'function') {
            textEdit.hideEditTextBox()
            traceNativeMindMapOp('textEdit.commitOnBackground', { reason })
          }
        } catch (error) {
          console.warn(
            '[mindmap-bridge] commit text edit on background failed',
            error
          )
        }
      }
      const resumeVisualTasksAfterHidden = () => {
        if (textRenderEnsurePendingWhileHidden && nativeMindMap) {
          textRenderEnsurePendingWhileHidden = false
          void ensureMindMapTextRendered('resume-after-visible')
        }
        if (thumbnailPendingWhileHidden && nativeMindMap) {
          thumbnailPendingWhileHidden = false
          traceNativeMindMapOp('thumbnailExport.resumeAfterVisible', {})
          scheduleDraftThumbnailExport(++mindMapDataRevision)
        }
      }
      const setHostPaneForeground = foreground => {
        if (hostPaneForeground === foreground) {
          return
        }
        hostPaneForeground = foreground
        traceNativeMindMapOp('hostPaneVisibility', { foreground })
        if (!foreground) {
          setInteractionDragActive(false)
          commitPendingTextEditForBackground('pane-background')
          return
        }
        resumeVisualTasksAfterHidden()
      }
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          setInteractionDragActive(false)
          // 浏览器级隐藏（切浏览器标签/最小化）同样视为离开编辑器：提交输入，
          // 让后台保存链拿到完整数据
          commitPendingTextEditForBackground('document-hidden')
          return
        }
        // 回到可见：补跑隐藏期间被跳过的文本强制渲染与缩略图导出
        // （后台保存只保数据，视觉产物延迟到可见后）
        resumeVisualTasksAfterHidden()
      })
      const reportMindMapSaveProgress = (requestId, phase, extra) => {
        if (
          nativeSaveInFlight &&
          phase !== 'skipped-not-ready' &&
          phase !== 'failed' &&
          phase !== 'concurrent'
        ) {
          nativeSaveInFlight.phase = phase
        }
        postToHost('mindMapSaveProgress', {
          requestId: requestId || null,
          phase,
          elapsedMs:
            nativeSaveInFlight &&
            typeof nativeSaveInFlight.startedAt === 'number'
              ? Math.round(performance.now() - nativeSaveInFlight.startedAt)
              : null,
          ...(extra || {})
        })
      }
      let nativeTraceSeq = 0
      // data 支持传函数：getData()/全树采样等重实参只在调试开启时才求值，
      // 否则 JS 会先算实参——每次编辑/拖拽落点都平白付出整树深拷贝的代价
      const traceNativeMindMapOp = (label, data) => {
        if (!isMindMapOperationTraceEnabled()) return
        const resolved = typeof data === 'function' ? data() : data
        nativeTraceSeq += 1
        const payload = {
          nativeSeq: nativeTraceSeq,
          nativeRevision: mindMapDataRevision,
          label,
          t: Math.round(performance.now()),
          sinceBridgeStart: Math.round(performance.now() - bridgeStartedAt),
          ...(resolved || {})
        }
        debugMindMapOpen(`op.${label}`, payload)
        postToHost('mindMapNativeOperationTrace', payload)
      }
      const reportIframeFailure = (payload) => {
        console.error('[mindmap-bridge] iframe failure', payload)
        postToHost('mindMapIframeError', payload)
      }
      const resetFailedBootstrap = reason => {
        debugMindMapOpen('resetFailedBootstrap', {
          reason,
          appStarted,
          hostAppInitedSent,
          hasNativeMindMap: !!nativeMindMap,
          renderEnded
        })
        appStarted = false
        appInitedSentToHost = false
        hostAppInitedSent = false
        renderEnded = false
        nativeMindMap = null
        hostAiConfigListenerReady = false
        const appRoot = document.getElementById('app')
        if (appRoot) {
          appRoot.innerHTML = ''
        }
      }
      window.addEventListener(
        'error',
        event => {
          const scriptTarget = event.target
          if (scriptTarget && scriptTarget.tagName === 'SCRIPT') {
            const src = scriptTarget.src || ''
            if (!hostAppInitedSent) {
              resetFailedBootstrap('script-error')
            }
            blockRuntime('script-error', {
              kind: 'script',
              message:
                'MindMap 脚本加载失败: ' + (src || 'unknown') +
                '（若已登录仍失败：整包部署 mind-map/dist/js 或检查 HTTP/2 反代 ERR_HTTP2_PROTOCOL_ERROR）',
              source: src || null
            })
            return
          }
          if (!window.takeOverApp || hostAppInitedSent) return
          reportIframeFailure({
            kind: 'error',
            message: event.message || 'Unknown iframe error',
            source: event.filename || null,
            line: event.lineno || null,
            column: event.colno || null
          })
        },
        true
      )
      window.addEventListener('unhandledrejection', event => {
        if (!window.takeOverApp) return
        const reason = event.reason
        const message =
          reason && reason.message
            ? reason.message
            : reason
              ? String(reason)
              : 'Unhandled promise rejection'
        const isChunkLoadError =
          (reason && reason.name === 'ChunkLoadError') ||
          /Loading chunk [\w-]+ failed/i.test(message)
        debugMindMapOpen('unhandledrejection', {
          message,
          isChunkLoadError,
          appStarted,
          hostAppInitedSent
        })
        if (isChunkLoadError && !hostAppInitedSent) {
          resetFailedBootstrap('ChunkLoadError')
        }
        reportIframeFailure({
          kind: 'unhandledrejection',
          message: isChunkLoadError
            ? 'MindMap 代码块加载失败（' + message + '）'
            : message
        })
      })
      const requestHost = (type, payload, timeout = 8000) => {
        return new Promise((resolve, reject) => {
          const requestId = String(Date.now()) + '-' + ++bridgeRequestSeq
          const timer = window.setTimeout(() => {
            bridgeRequests.delete(requestId)
            reject(new Error('Host request timeout'))
          }, timeout)
          bridgeRequests.set(requestId, { resolve, reject, timer })
          postToHost(type, {
            requestId,
            ...(payload || {})
          })
        })
      }
      const isDocumentHidden = () =>
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden'
      // rAF 与定时器竞速：document.hidden 时浏览器完全暂停 rAF，
      // 仅靠 rAF 会让保存链在后台永久挂起（后台保存超时的根因）；
      // 可见时 rAF 先到（下一帧语义不变），定时器只是兜底
      const waitForNextFrame = () => {
        return new Promise(resolve => {
          let settled = false
          const finish = () => {
            if (settled) return
            settled = true
            resolve()
          }
          if (window.requestAnimationFrame) {
            window.requestAnimationFrame(finish)
          }
          window.setTimeout(finish, 250)
        })
      }
      const isTextEditVisible = () => {
        const textEdit =
          nativeMindMap &&
          nativeMindMap.renderer &&
          nativeMindMap.renderer.textEdit
        return (
          textEdit &&
          typeof textEdit.isShowTextEdit === 'function' &&
          textEdit.isShowTextEdit()
        )
      }
      const waitForPendingInsertEditForSnapshot = async reason => {
        const renderer = nativeMindMap && nativeMindMap.renderer
        if (!renderer) {
          return true
        }
        // 隐藏页：不可能有进行中的输入，且页内定时器被节流，
        // 等待渲染安定只会拖慢乃至拖垮后台保存，直接放行取数据
        if (isDocumentHidden()) {
          return true
        }
        let waited = false
        for (let attempt = 1; attempt <= 8; attempt++) {
          const pendingPromise = renderer.pendingInsertEditPromise
          const hasPendingRender =
            !!renderer.pendingInsertEditRequest ||
            !!renderer.pendingRenderRequest ||
            !!renderer.isRendering
          if (pendingPromise && typeof pendingPromise.then === 'function') {
            waited = true
            traceNativeMindMapOp('requestMindMapSave.waitPendingInsertEdit', {
              reason,
              attempt,
              phase: 'edit-open-promise'
            })
            await Promise.race([
              pendingPromise,
              new Promise(resolve => window.setTimeout(resolve, 250))
            ])
            await waitForNextFrame()
            continue
          }
          if (!hasPendingRender) {
            if (waited) {
              traceNativeMindMapOp('requestMindMapSave.pendingInsertEditSettled', {
                reason,
                attempt,
                textEditVisible:
                  renderer.textEdit &&
                  typeof renderer.textEdit.isShowTextEdit === 'function'
                    ? renderer.textEdit.isShowTextEdit()
                    : null
              })
            }
            return true
          }
          waited = true
          traceNativeMindMapOp('requestMindMapSave.waitPendingInsertEdit', {
            reason,
            attempt,
            phase: 'render-pending',
            hasPendingInsertEdit: !!renderer.pendingInsertEditRequest,
            hasPendingRenderRequest: !!renderer.pendingRenderRequest,
            isRendering: !!renderer.isRendering
          })
          await new Promise(resolve =>
            window.setTimeout(resolve, attempt <= 2 ? 0 : 16)
          )
        }
        traceNativeMindMapOp('requestMindMapSave.pendingInsertEditTimeout', {
          reason,
          hasPendingInsertEdit: !!renderer.pendingInsertEditRequest,
          hasPendingRenderRequest: !!renderer.pendingRenderRequest,
          isRendering: !!renderer.isRendering,
          hasPendingInsertEditPromise: !!renderer.pendingInsertEditPromise
        })
        return false
      }
      const syncPendingTextEditForSnapshot = async reason => {
        const insertSettled = await waitForPendingInsertEditForSnapshot(reason)
        if (!insertSettled) {
          return false
        }
        const textEdit =
          nativeMindMap &&
          nativeMindMap.renderer &&
          nativeMindMap.renderer.textEdit
        if (!textEdit || !isTextEditVisible()) {
          return true
        }
        // pane 后台 / 页面隐藏：用户已离开编辑器，「不打断编辑」的顾虑不存在。
        // 提交式结束编辑（数据完整性优先，空文本也是用户意图），保证后台保存
        // 拿到编辑框里的真实内容——否则保存旧数据清掉黄点后宿主会休眠 pane，
        // 编辑框里未落库的文字随卸载丢失（表现为切回后修改全部消失）。
        if (!hostPaneForeground || isDocumentHidden()) {
          try {
            textEdit.hideEditTextBox()
            traceNativeMindMapOp('snapshot.commitTextEdit.background', {
              reason
            })
            return true
          } catch (error) {
            console.warn(
              'Failed to commit MindMap text edit before background snapshot',
              error
            )
            traceNativeMindMapOp('snapshot.finishTextEdit.fail', {
              reason,
              message: error && error.message ? error.message : String(error)
            })
            return false
          }
        }
        // 前台快照走非破坏式同步：编辑中直接 getData 会丢字，但强制
        // hideEditTextBox 会把 Tab 新建后正在编辑的节点踢出编辑/选中态。
        // syncEditingTextToNode 把编辑中的文本落进节点数据（编辑框与光标/
        // 全选保持不动）；缩略图侧的"编辑中 SVG 文本被隐藏导致丢字"由
        // Export.svg 的 preserveTextEdit 分支在克隆期间临时恢复可见性兜底。
        try {
          if (typeof nativeMindMap.syncEditingTextToNodeForSnapshot === 'function') {
            await nativeMindMap.syncEditingTextToNodeForSnapshot()
          } else if (typeof textEdit.syncEditingTextToNode === 'function') {
            await textEdit.syncEditingTextToNode()
          }
          await waitForMindMapRenderSettled()
          await waitForNextFrame()
          return true
        } catch (error) {
          console.warn('Failed to sync MindMap text edit before snapshot', error)
          traceNativeMindMapOp('snapshot.finishTextEdit.fail', {
            reason,
            message: error && error.message ? error.message : String(error)
          })
          return false
        }
      }
      const collectMindMapDataForSnapshot = async (reason, options = {}) => {
        // 隐藏页跳过强制渲染：getData 读的是数据树，与 SVG 渲染无关
        const ensureRendered =
          options.ensureRendered !== false && !isDocumentHidden()
        const insertSettled = await waitForPendingInsertEditForSnapshot(reason)
        if (!insertSettled) {
          traceNativeMindMapOp('requestMindMapSave.skipUnsettled', {
            reason
          })
          return null
        }
        const syncedOk = await syncPendingTextEditForSnapshot(reason)
        if (!syncedOk) {
          traceNativeMindMapOp('collectMindMapDataForSnapshot.syncTextEditFailed', {
            reason
          })
          return null
        }
        if (ensureRendered) {
          await ensureMindMapTextRendered(reason)
        }
        if (
          nativeMindMap &&
          typeof nativeMindMap.getDataForSnapshot === 'function'
        ) {
          return await nativeMindMap.getDataForSnapshot(true)
        }
        return nativeMindMap && typeof nativeMindMap.getData === 'function'
          ? nativeMindMap.getData(true)
          : null
      }
      const getMindMapThumbnail = async () => {
        if (!nativeMindMap || typeof nativeMindMap.export !== 'function') {
          return null
        }
        try {
          // preserveTextEdit：不打断进行中的文本编辑（同步文本+临时恢复隐藏文本）
          // removeActiveState：在导出克隆上剥离选中/高亮态，缩略图与选中状态解耦
          return await nativeMindMap.export('svg', false, 'MindMap', {
            preserveTextEdit: true,
            removeActiveState: true
          })
        } catch (error) {
          console.warn('Failed to export MindMap thumbnail', error)
          return null
        }
      }
      const waitForMindMapRenderSettled = () => {
        return new Promise(resolve => {
          const finish = () => {
            waitForNextFrame()
              .then(() => waitForNextFrame())
              .then(resolve)
          }
          if (renderEnded && nativeMindMap) {
            finish()
            return
          }
          if (window.$bus && typeof window.$bus.$once === 'function') {
            window.$bus.$once('node_tree_render_end', finish)
            return
          }
          window.setTimeout(finish, 32)
        })
      }
      const stripTextHtml = value => {
        const div = document.createElement('div')
        div.innerHTML = String(value || '')
        return (div.textContent || '').trim()
      }
      const summarizeExpectedTextNodes = data => {
        const summary = {
          expectedTextNodes: 0,
          expectedRichTextNodes: 0,
          expectedPlainTextNodes: 0
        }
        const walk = node => {
          if (!node || !node.data) return
          const text = stripTextHtml(node.data.text)
          if (text) {
            summary.expectedTextNodes += 1
            if (node.data.richText) {
              summary.expectedRichTextNodes += 1
            } else {
              summary.expectedPlainTextNodes += 1
            }
          }
          ;(node.children || []).forEach(walk)
        }
        if (data && data.root) walk(data.root)
        return summary
      }
      const getNumericSize = (el, attrName, rectValue) => {
        const attr = Number(el.getAttribute(attrName) || 0)
        return Number.isFinite(attr) && attr > 0 ? attr : rectValue || 0
      }
      const collectMindMapTextRenderHealth = expectedData => {
        const expected = summarizeExpectedTextNodes(expectedData)
        const rootEl = nativeMindMap && nativeMindMap.el
        const containerRect = rootEl
          ? rootEl.getBoundingClientRect()
          : { width: 0, height: 0 }
        const foreignObjects = rootEl
          ? Array.from(rootEl.querySelectorAll('foreignObject'))
          : []
        const textForeignObjects = foreignObjects.filter(item =>
          (item.textContent || '').trim()
        )
        const collapsedForeignObjects = textForeignObjects.filter(item => {
          const rect = item.getBoundingClientRect()
          const width = getNumericSize(item, 'width', rect.width)
          const height = getNumericSize(item, 'height', rect.height)
          return width <= 1 || height <= 1
        })
        const svgTextNodes = rootEl
          ? Array.from(rootEl.querySelectorAll('text')).filter(item =>
              (item.textContent || '').trim()
            )
          : []
        const renderedTextCount = textForeignObjects.length + svgTextNodes.length
        const hasAllExpectedText = renderedTextCount >= expected.expectedTextNodes
        const hasAllExpectedRichText =
          expected.expectedRichTextNodes === 0 ||
          textForeignObjects.length >= expected.expectedRichTextNodes
        const health = {
          ...expected,
          renderedTextCount,
          hasAllExpectedText,
          hasAllExpectedRichText,
          foreignObjectCount: foreignObjects.length,
          textForeignObjectCount: textForeignObjects.length,
          collapsedForeignObjectCount: collapsedForeignObjects.length,
          svgTextCount: svgTextNodes.length,
          containerWidth: Math.round(containerRect.width || 0),
          containerHeight: Math.round(containerRect.height || 0)
        }
        health.healthy =
          expected.expectedTextNodes === 0 ||
          (health.containerWidth > 1 &&
            health.containerHeight > 1 &&
            hasAllExpectedText &&
            hasAllExpectedRichText &&
            collapsedForeignObjects.length === 0)
        return health
      }
      const ensureMindMapTextRendered = async reason => {
        if (!nativeMindMap || !nativeMindMap.renderer) {
          return
        }
        // 隐藏页布局停摆：强制渲染 + 健康度检查（逐 foreignObject 量矩形）
        // 只能量出全零，白耗节流定时器；回到可见后由 visibilitychange 补跑
        if (isDocumentHidden()) {
          textRenderEnsurePendingWhileHidden = true
          traceNativeMindMapOp('ensureTextRendered.skippedWhileHidden', {
            reason
          })
          return
        }
        const renderer = nativeMindMap.renderer
        if (typeof renderer.forceLoadNode !== 'function') {
          if (!renderEnded) {
            await waitForMindMapRenderSettled()
          }
          return
        }
        const runPass = async (passReason, attempt) => {
          renderer.forceLoadNode()
          await waitForMindMapRenderSettled()
          const health = collectMindMapTextRenderHealth(bridgeState.mindMapData)
          debugMindMapOpen('ensureMindMapTextRendered pass', {
            reason,
            passReason,
            attempt,
            health
          })
          return health
        }
        let health = await runPass('initial', 1)
        const el = nativeMindMap.el
        if (el) {
          const rect = el.getBoundingClientRect()
          if (rect.width <= 1 || rect.height <= 1) {
            await waitForNextFrame()
            await waitForNextFrame()
            health = await runPass('container-resized', 2)
          }
        }
        for (let attempt = 3; attempt <= 5 && health && !health.healthy; attempt++) {
          debugMindMapOpen('text render unhealthy after force render', {
            reason,
            attempt: attempt - 1,
            health
          })
          await new Promise(resolve => window.setTimeout(resolve, 32 * attempt))
          health = await runPass('retry-unhealthy', attempt)
        }
      }
      const exportMindMapThumbnailSnapshot = async reason => {
        if (!nativeMindMap || typeof nativeMindMap.export !== 'function') {
          return null
        }
        // 隐藏页 rAF 暂停 + 布局不更新，导缩略图必然挂起或产出坏图；
        // 记下待办，回到可见后由 visibilitychange 补一次导出
        if (isDocumentHidden()) {
          thumbnailPendingWhileHidden = true
          traceNativeMindMapOp('thumbnailExport.skippedWhileHidden', { reason })
          return null
        }
        await syncPendingTextEditForSnapshot(reason)
        await ensureMindMapTextRendered(reason)
        return await getMindMapThumbnail()
      }
      const scheduleDraftThumbnailExport = revision => {
        draftThumbExportRevision = revision
        traceNativeMindMapOp('draftThumbnailExport.scheduled', {
          revision,
          debounceMs: DRAFT_THUMB_EXPORT_DEBOUNCE_MS
        })
        window.clearTimeout(draftThumbExportTimer)
        draftThumbExportTimer = window.setTimeout(() => {
          draftThumbExportTimer = null
          // 连续拖拽时 450ms 防抖尾正好落进下一次拖拽：全树强制渲染 + svg 克隆
          // + 序列化是最大的单笔卡顿来源，推迟到拖拽结束后按原防抖重排
          if (interactionDragActive) {
            if (!draftThumbExportWaitingIdle) {
              draftThumbExportWaitingIdle = true
              traceNativeMindMapOp('draftThumbnailExport.deferredWhileDragging', {
                revision: draftThumbExportRevision
              })
              runWhenDragIdle(() => {
                draftThumbExportWaitingIdle = false
                scheduleDraftThumbnailExport(draftThumbExportRevision)
              })
            }
            return
          }
          const revisionAtExport = draftThumbExportRevision
          traceNativeMindMapOp('draftThumbnailExport.timerFired', {
            revision: revisionAtExport
          })
          const runExport = async () => {
            if (!nativeMindMap || !renderEnded) {
              debugMindMapOpen('draft thumbnail export deferred (not rendered)', {
                revision: revisionAtExport,
                hasNativeMindMap: !!nativeMindMap,
                renderEnded
              })
              if (window.$bus && typeof window.$bus.$once === 'function') {
                window.$bus.$once('node_tree_render_end', () => {
                  if (draftThumbExportRevision === revisionAtExport) {
                    void runExport()
                  }
                })
              }
              return
            }
            const exportStart = performance.now()
            const thumbnail = await exportMindMapThumbnailSnapshot(
              'draft-thumb-export'
            )
            debugMindMapOpen('draft thumbnail export done', {
              revision: revisionAtExport,
              elapsed: Math.round(performance.now() - exportStart),
              hasThumbnail: !!thumbnail,
              thumbnailLength: thumbnail ? thumbnail.length : 0
            })
            if (!thumbnail) return
            traceNativeMindMapOp('draftThumbnailExport.posted', {
              revision: revisionAtExport,
              thumbnailLength: thumbnail.length
            })
            postToHost('saveMindMapThumbnail', {
              revision: revisionAtExport,
              thumbnail
            })
          }
          void runExport()
        }, DRAFT_THUMB_EXPORT_DEBOUNCE_MS)
      }
      const postMindMapDataToHost = async (data, requestId, providedThumbnail) => {
        const revision = ++mindMapDataRevision
        const draftUserEditMeta = consumePendingUserEditDraftMeta()
        traceNativeMindMapOp('saveMindMapData.prepare', () => ({
          requestId: requestId || null,
          revision,
          userEdit: draftUserEditMeta.userEdit,
          reason: draftUserEditMeta.reason,
          dirtyNotifyEnabled,
          data: summarizeNativeMindMapDataForTrace(data)
        }))
        if (requestId) {
          const exportStart = performance.now()
          debugMindMapOpen('postMindMapDataToHost before thumbnail export', {
            requestId,
            revision,
            rootChildren:
              data && data.root && data.root.children
                ? data.root.children.length
                : 0
          })
          let thumbnail = providedThumbnail
          if (thumbnail === undefined) {
            thumbnail = await exportMindMapThumbnailSnapshot(
              'save-mindmap-data'
            )
          }
          traceNativeMindMapOp('saveMindMapData.thumbnailExported', () => ({
            requestId,
            revision,
            elapsed: Math.round(performance.now() - exportStart),
            hasThumbnail: !!thumbnail,
            thumbnailLength: thumbnail ? thumbnail.length : 0,
            data: summarizeNativeMindMapDataForTrace(data)
          }))
          debugMindMapOpen('postMindMapDataToHost after thumbnail export', {
            requestId,
            revision,
            elapsed: Math.round(performance.now() - exportStart),
            hasThumbnail: !!thumbnail,
            thumbnailLength: thumbnail ? thumbnail.length : 0
          })
          postToHost('saveMindMapData', {
            requestId,
            revision,
            data,
            thumbnail,
            userEdit: draftUserEditMeta.userEdit,
            reason: draftUserEditMeta.reason
          })
          traceNativeMindMapOp('saveMindMapData.postedSaveResponse', () => ({
            requestId,
            revision,
            userEdit: draftUserEditMeta.userEdit,
            reason: draftUserEditMeta.reason,
            hasThumbnail: !!thumbnail,
            data: summarizeNativeMindMapDataForTrace(data)
          }))
          return
        }
        if (!dirtyNotifyEnabled && !draftUserEditMeta.userEdit) {
          traceNativeMindMapOp('saveMindMapData.suppressed', () => ({
            ...describeDirtyNotifyWindow(),
            revision,
            userEdit: draftUserEditMeta.userEdit,
            reason: draftUserEditMeta.reason,
            data: summarizeNativeMindMapDataForTrace(data)
          }))
          debugMindMapOpen('postMindMapDataToHost draft push suppressed', {
            ...describeDirtyNotifyWindow(),
            revision,
            rootChildren:
              data && data.root && data.root.children
                ? data.root.children.length
                : 0,
            rootText:
              data && data.root && data.root.data
                ? String(data.root.data.text || '').slice(0, 40)
                : null
          })
          return
        }
        // 富文本采样走全树遍历，仅在调试开启时执行
        if (isMindMapDebugEnabled()) {
          const sampleText = (() => {
            let sample = ''
            const walk = node => {
              if (sample || !node || !node.data) return
              const text = String(node.data.text || '')
              if (text.includes('<strong') || text.includes('ql-indent-')) {
                sample = text
                return
              }
              (node.children || []).forEach(walk)
            }
            if (data && data.root) walk(data.root)
            return sample
          })()
          debugMindMapOpen('postMindMapDataToHost draft data push', {
            revision,
            userEdit: draftUserEditMeta.userEdit,
            reason: draftUserEditMeta.reason,
            rootChildren:
              data && data.root && data.root.children
                ? data.root.children.length
                : 0,
            sampleStrongCount: sampleText
              ? (sampleText.match(/<strong\b/gi) || []).length
              : 0,
            sampleTextLen: sampleText.length
          })
        }
        postToHost('saveMindMapData', {
          revision,
          data,
          thumbnail: null,
          userEdit: draftUserEditMeta.userEdit,
          reason: draftUserEditMeta.reason
        })
        traceNativeMindMapOp('saveMindMapData.postedDraft', () => ({
          revision,
          userEdit: draftUserEditMeta.userEdit,
          reason: draftUserEditMeta.reason,
          data: summarizeNativeMindMapDataForTrace(data)
        }))
        scheduleDirtyNotifyEnable('draft-push')
        scheduleDraftThumbnailExport(revision)
      }
      const resolveHostRequest = message => {
        const payload = message.payload || {}
        const requestId = payload.requestId
        if (!requestId || !bridgeRequests.has(requestId)) return false
        const pending = bridgeRequests.get(requestId)
        bridgeRequests.delete(requestId)
        window.clearTimeout(pending.timer)
        if (payload.ok === false) {
          pending.reject(new Error(payload.error || 'Host request failed'))
        } else {
          pending.resolve(payload)
        }
        return true
      }
      // 宿主推送数据的消费入口：与画布当前数据做指纹比对，内容未变则跳过
      // 避免 cache-first/server 刷新/pendingPayload flush 等重复推送触发无谓的全量重建
      const getMindMapFullDataFingerprint = data => {
        if (!data || !data.root) return ''
        try {
          return JSON.stringify({
            root: data.root,
            layout: data.layout || null,
            theme: data.theme || null
          })
        } catch (error) {
          return ''
        }
      }
      const applyHostMindMapData = async reason => {
        if (!nativeMindMap || typeof nativeMindMap.setFullData !== 'function') {
          return
        }
        const data = bridgeState.mindMapData
        if (!data) {
          return
        }
        const incomingFp = getMindMapFullDataFingerprint(data)
        let currentFp = ''
        if (incomingFp && typeof nativeMindMap.getData === 'function') {
          try {
            currentFp = getMindMapFullDataFingerprint(nativeMindMap.getData(true))
          } catch (error) {
            currentFp = ''
          }
        }
        if (incomingFp && incomingFp === currentFp) {
          debugMindMapOpen('skip host mindMapData apply (unchanged)', { reason })
          await ensureMindMapTextRendered(`unchanged:${reason}`)
          return
        }
        let dataToApply = data
        if (!data.view && typeof nativeMindMap.getData === 'function') {
          try {
            const currentData = nativeMindMap.getData(true)
            if (currentData && currentData.view) {
              dataToApply = {
                ...data,
                view: currentData.view
              }
              debugMindMapOpen('preserve current view for host mindMapData apply', {
                reason
              })
            }
          } catch (error) {
            debugMindMapOpen('preserve current view failed', {
              reason,
              message: error && error.message ? error.message : String(error)
            })
          }
        }
        nativeMindMap.setFullData(dataToApply)
        await ensureMindMapTextRendered(reason)
      }
      const setTakeOverAppMethods = data => {
        bridgeState = {
          ...defaultBridgeState,
          ...(data || {})
        }
        if (bridgeState.mindMapData) {
          bridgeState.mindMapData = normalizeBridgeMindMapData(
            bridgeState.mindMapData
          )
        }
        window.takeOverAppEmbedMode = bridgeState.embedMode === true
        window.takeOverAppReadOnly = bridgeState.readOnly === true
        window.takeOverAppMethods = {}
        // 获取思维导图数据的函数
        window.takeOverAppMethods.getMindMapData = () => {
          return bridgeState.mindMapData
        }
        // 保存思维导图数据的函数
        window.takeOverAppMethods.saveMindMapData = data => {
          void (async () => {
            if (isTextEditVisible()) {
              traceNativeMindMapOp('takeOverApp.saveMindMapData.skippedWhileEditing', () => ({
                data: summarizeNativeMindMapDataForTrace(data)
              }))
              return
            }
            const snapshot =
              await collectMindMapDataForSnapshot('takeover-save')
            if (!snapshot) {
              traceNativeMindMapOp('takeOverApp.saveMindMapData.skippedUnsettled', () => ({
                data: summarizeNativeMindMapDataForTrace(data)
              }))
              return
            }
            bridgeState.mindMapData = snapshot
            traceNativeMindMapOp('takeOverApp.saveMindMapData', () => ({
              usedSnapshot: true,
              data: summarizeNativeMindMapDataForTrace(snapshot)
            }))
            await postMindMapDataToHost(snapshot)
          })()
        }
        // 获取思维导图配置，也就是实例化时会传入的选项
        window.takeOverAppMethods.getMindMapConfig = () => {
          return bridgeState.mindMapConfig
        }
        // 保存思维导图配置
        window.takeOverAppMethods.saveMindMapConfig = config => {
          bridgeState.mindMapConfig = config
          postToHost('saveMindMapConfig', config)
        }
        // 获取语言的函数
        window.takeOverAppMethods.getLanguage = () => {
          return bridgeState.lang
        }
        // 保存语言的函数
        window.takeOverAppMethods.saveLanguage = lang => {
          bridgeState.lang = lang
          postToHost('saveLanguage', lang)
        }
        // 获取本地配置的函数
        window.takeOverAppMethods.getLocalConfig = () => {
          return bridgeState.localConfig
        }
        // 保存本地配置的函数
        window.takeOverAppMethods.saveLocalConfig = config => {
          bridgeState.localConfig = config
          postToHost('saveLocalConfig', config)
        }
        window.takeOverAppMethods.writeClipboardText = text => {
          return requestHost('CLIPBOARD_WRITE_TEXT', { text })
        }
        window.takeOverAppMethods.readClipboardText = () => {
          return requestHost('CLIPBOARD_READ_TEXT')
        }
        window.takeOverAppMethods.readClipboardItems = () => {
          return requestHost('CLIPBOARD_READ')
        }
        window.takeOverAppMethods.writeClipboardImage = (dataUrl, type) => {
          return requestHost('CLIPBOARD_WRITE_IMAGE', {
            dataUrl,
            type: type || 'image/png'
          })
        }
      }

      const notifyHostAppInited = caller => {
        debugMindMapOpen('notifyHostAppInited called', {
          caller,
          appInitedSentToHost,
          hasNativeMindMap: !!nativeMindMap,
          renderEnded,
          willFire: !appInitedSentToHost && !!nativeMindMap && renderEnded
        })
        if (appInitedSentToHost) return
        if (!nativeMindMap || !renderEnded) return
        appInitedSentToHost = true
        hostAppInitedSent = true
        mindmapLoadMark('notifyHostAppInited', {
          caller,
          hasExport: typeof nativeMindMap?.export === 'function',
          scale: nativeMindMap?.view?.scale || null,
          slowResources: getSlowMindMapResources()
        })
        debugMindMapOpen('notifyHostAppInited (after render)', {
          totalElapsed: Math.round(performance.now() - bridgeStartedAt),
          hasExport: typeof nativeMindMap?.export === 'function',
          scale: nativeMindMap?.view?.scale || null,
          slowResources: getSlowMindMapResources()
        })
        postToHost('appInited')
        scheduleDirtyNotifyEnable('app-inited')
      }

      const scheduleDirtyNotifyEnable = (reason, delayMs = DIRTY_NOTIFY_SETTLE_MS) => {
        dirtyNotifyEnabled = false
        dirtyNotifyDisabledMeta = { reason, at: performance.now() }
        debugMindMapOpen('dirty notify disabled (window start)', {
          reason,
          delayMs
        })
        if (dirtyNotifyEnableTimer) {
          clearTimeout(dirtyNotifyEnableTimer)
          dirtyNotifyEnableTimer = null
        }
        dirtyNotifyEnableTimer = window.setTimeout(() => {
          dirtyNotifyEnabled = true
          dirtyNotifyEnableTimer = null
          debugMindMapOpen('dirty notify enabled', { reason, delayMs })
        }, delayMs)
      }

      const startTakeOverApp = data => {
        if (!isRuntimeReady()) {
          blockRuntime('startTakeOverApp-not-ready', {
            kind: 'bootstrap',
            message:
              'MindMap 运行时未就绪（initApp 缺失）。请检查 /mind-map/dist/js/*.js 是否 404 或被鉴权拦截。'
          })
          return
        }
        if (appStarted && hostAppInitedSent && nativeMindMap) {
          debugMindMapOpen('startTakeOverApp skipped: already inited')
          return
        }
        if (appStarted && !hostAppInitedSent) {
          debugMindMapOpen('startTakeOverApp retry after failed bootstrap')
          resetFailedBootstrap('retry')
        }
        appStarted = true
        debugMindMapOpen('startTakeOverApp before setTakeOverAppMethods', {
          hasData: !!(data && data.mindMapData),
          rootChildren:
            data &&
            data.mindMapData &&
            data.mindMapData.root &&
            data.mindMapData.root.children
              ? data.mindMapData.root.children.length
              : 0
        })
        setTakeOverAppMethods(data)
        // Re-emit node_tree_render_end after Vue binds mindMap events (host appInited handshake).
        window.__mindMapSyncLayout = true
        debugMindMapOpen('syncLayout flag', {
          embedMode: !!window.takeOverAppEmbedMode,
          readOnly: !!window.takeOverAppReadOnly,
          syncLayout: !!window.__mindMapSyncLayout
        })
        if (!window.$bus || typeof window.$bus.$on !== 'function') {
          blockRuntime('startTakeOverApp-no-bus', {
            kind: 'bootstrap',
            message: 'MindMap 事件总线未初始化（$bus 缺失），脚本可能未成功执行。'
          })
          return
        }
        let textEditDirtyTimer = null
        scheduleDirtyNotifyEnable('bootstrap-start')
        const userEditCommandNames = new Set([
          'INSERT_NODE',
          'INSERT_CHILD_NODE',
          'INSERT_PARENT_NODE',
          'INSERT_MULTI_NODE',
          'INSERT_MULTI_CHILD_NODE',
          'REMOVE_NODE',
          'REMOVE_CURRENT_NODE',
          'SET_NODE_EXPAND',
          'MOVE_UP_ONE_LEVEL',
          'MOVE_NODE_TO',
          'MOVE_NODE_BY_DROP_TARGET',
          'UP_NODE',
          'DOWN_NODE'
        ])
        const notifyDirty = (opts = {}) => {
          const forceUserEdit = opts.userEdit === true
          if (forceUserEdit) {
            notePendingUserEditDraftMeta(opts.reason || null)
          }
          if (!dirtyNotifyEnabled && !forceUserEdit) {
            traceNativeMindMapOp('dirtyNotify.suppressed', {
              reason: opts.reason || null,
              userEdit: forceUserEdit,
              ...describeDirtyNotifyWindow()
            })
            debugMindMapOpen(
              'dirty notify suppressed',
              describeDirtyNotifyWindow()
            )
            return
          }
          traceNativeMindMapOp('dirtyNotify.emit', () => ({
            phase: forceUserEdit ? 'user-edit' : 'data-change',
            forced: forceUserEdit && !dirtyNotifyEnabled,
            reason: opts.reason || null,
            userEdit: forceUserEdit,
            data: summarizeNativeMindMapDataForTrace(
              nativeMindMap && typeof nativeMindMap.getData === 'function'
                ? nativeMindMap.getData()
                : null
            )
          }))
          debugMindMapOpen('dirty notify emit', {
            phase: forceUserEdit ? 'text-edit' : 'data-change',
            forced: forceUserEdit && !dirtyNotifyEnabled,
            reason: opts.reason || null
          })
          postToHost('mindMapDirtyState', {
            dirty: true,
            userEdit: forceUserEdit,
            reason: opts.reason || null
          })
        }
        window.$bus.$on('data_change', notifyDirty)
        window.$bus.$on('hide_text_edit', () => {
          if (textEditDirtyTimer) {
            clearTimeout(textEditDirtyTimer)
            textEditDirtyTimer = null
          }
        })
        window.$bus.$on('view_data_change', viewData => {
          if (viewData) {
            postToHost('mindMapViewState', viewData)
          }
        })
        const notifyHostPreviewViewport = payload => {
          const reason = (payload && payload.reason) || 'preview-viewport'
          const requestId =
            payload && payload.requestId !== undefined ? payload.requestId : null
          const ok = !!(payload && payload.ok)
          const error =
            payload && payload.error !== undefined ? payload.error : null
          window.setTimeout(() => {
            debugMindMapOpen('preview viewport applied to host', {
              reason,
              requestId,
              ok,
              error,
              scaleAfter: nativeMindMap?.view?.scale || null
            })
            postToHost('mindMapViewRestoreDone', {
              requestId,
              reason,
              ok,
              error,
              scale: nativeMindMap?.view?.scale || null
            })
            if (ok && payload && payload.scale != null && payload.x != null && payload.y != null) {
              postToHost('mindMapViewState', {
                scale: payload.scale,
                x: payload.x,
                y: payload.y
              })
            }
          }, ok ? 80 : 0)
        }
        window.$bus.$on('embed_preview_viewport_applied', notifyHostPreviewViewport)
        window.$bus.$on('host_ai_config_listener_ready', () => {
          hostAiConfigListenerReady = true
          debugMindMapOpen('host ai config listener ready from Vue', {
            hasBus: !!(window.$bus && typeof window.$bus.$emit === 'function'),
            hasPendingHostAiConfig: !!pendingHostAiConfig,
            hasNativeMindMap: !!nativeMindMap,
            renderEnded
          })
          flushPendingHostAiConfig('host-ai-listener-ready')
        })
        // 思维导图实例创建完成事件
        // MindMap.render() uses setTimeout(0) and doLayout uses asyncRun
        // (which chains multiple setTimeout(0) calls). The tree is NOT fully
        // rendered when the constructor returns. Defer appInited to the host
        // until node_tree_render_end fires so that SVG export produces a
        // complete snapshot.
        window.$bus.$on('app_inited', mindMap => {
          nativeMindMap = mindMap
          if (
            bridgeState.readOnly &&
            typeof nativeMindMap.setMode === 'function'
          ) {
            nativeMindMap.setMode('readonly')
            window.$bus.$emit('host_readonly_mode', true)
          }
          debugMindMapOpen('app_inited from Vue', {
            totalElapsed: Math.round(performance.now() - bridgeStartedAt),
            renderEnded
          })
          notifyHostAppInited('app_inited')
          // 拖拽会话跟踪：node_dragging（节点拖拽，逐帧触发、内部去重）与
          // drag（画布平移）标记开始；mouseup/node_dragend 标记结束。
          // 节点 mousedown 会阻止冒泡，两类手势不会互相误报
          nativeMindMap.on('node_dragging', () => {
            setInteractionDragActive(true)
          })
          nativeMindMap.on('drag', () => {
            setInteractionDragActive(true)
          })
          nativeMindMap.on('node_dragend', () => {
            setInteractionDragActive(false)
          })
          nativeMindMap.on('mouseup', () => {
            setInteractionDragActive(false)
          })
          // 直接在 mindMap 实例上监听文本编辑变化（不通过 $bus 转发，避免触发 RichText 内部错误）
          nativeMindMap.on('node_text_edit_change', () => {
            if (textEditDirtyTimer) return
          traceNativeMindMapOp('user.textEdit.change', () => ({
            data: summarizeNativeMindMapDataForTrace(
              nativeMindMap && typeof nativeMindMap.getData === 'function'
                ? nativeMindMap.getData(true)
                : null
            )
          }))
            notifyDirty({ userEdit: true, reason: 'text-edit' })
            textEditDirtyTimer = setTimeout(() => {
              textEditDirtyTimer = null
            }, 150)
          })
          nativeMindMap.on('afterExecCommand', commandName => {
            if (!userEditCommandNames.has(commandName)) return
          traceNativeMindMapOp('user.command.afterExec', () => ({
            commandName,
            data: summarizeNativeMindMapDataForTrace(
              nativeMindMap && typeof nativeMindMap.getData === 'function'
                ? nativeMindMap.getData(true)
                : null
            )
          }))
            notifyDirty({
              userEdit: true,
              reason: `command:${commandName}`
            })
          })
        })
        window.$bus.$on('node_tree_render_end', () => {
          renderEnded = true
          debugMindMapOpen('node_tree_render_end', {
            hasNativeMindMap: !!nativeMindMap,
            appInitedSentToHost
          })
          notifyHostAppInited('node_tree_render_end')
        })
        // 实例化页面
        mindmapLoadMark('before window.initApp')
        debugMindMapOpen('before window.initApp')
        const initAppStart = performance.now()
        window.initApp()
        mindmapLoadMark('after window.initApp call', {
          elapsed: Math.round(performance.now() - initAppStart)
        })
        debugMindMapOpen('after window.initApp call', {
          hasBus: !!(window.$bus && typeof window.$bus.$emit === 'function'),
          listenerReady: hostAiConfigListenerReady,
          hasPendingHostAiConfig: !!pendingHostAiConfig
        })
      }

      window.addEventListener('message', async event => {
        const message = event.data
        if (!message) return
        const isHostMessage = message.source === hostSource
        const isPreviewControlMessage =
          message.type === 'MINDMAP_PREVIEW_LOCATE' ||
          message.type === 'MINDMAP_PREVIEW_RESIZE'
        if (!isHostMessage && !isPreviewControlMessage) return
        if (
          message.type === 'CLIPBOARD_RESULT' ||
          message.type === 'CLIPBOARD_READ_RESULT' ||
          message.type === 'CLIPBOARD_READ_ITEMS_RESULT'
        ) {
          resolveHostRequest(message)
          return
        }
        if (message.type === 'mindMapHostDebug') {
          const payload = message.payload || {}
          debugMindMapHostForward(
            payload.scope || 'mindmap-host',
            payload.label || 'debug',
            payload.data
          )
          return
        }
        if (message.type === 'initMindMap') {
          scheduleDirtyNotifyEnable('init-mind-map')
          const richSummary = summarizeMindMapPayloadRichText(message.payload)
          mindmapLoadMark('received initMindMap message', {
            appStarted,
            hostAppInitedSent,
            hasNativeMindMap: !!nativeMindMap,
            rootChildren:
              message.payload &&
              message.payload.mindMapData &&
              message.payload.mindMapData.root &&
              message.payload.mindMapData.root.children
                ? message.payload.mindMapData.root.children.length
                : 0,
            ...richSummary
          })
          debugMindMapOpen('received initMindMap message', {
            appStarted,
            hostAppInitedSent,
            hasNativeMindMap: !!nativeMindMap,
            ...richSummary
          })
          if (appStarted && nativeMindMap && hostAppInitedSent) {
            setTakeOverAppMethods(message.payload)
            void applyHostMindMapData('init-mind-map-repeat')
            return
          }
          startTakeOverApp(message.payload)
        }
        if (message.type === 'setMindMapData') {
          const richSummary = summarizeMindMapPayloadRichText(message.payload)
          mindmapLoadMark('received setMindMapData message', {
            appStarted,
            hostAppInitedSent,
            hasNativeMindMap: !!nativeMindMap,
            ...richSummary
          })
          debugMindMapOpen('received setMindMapData message', richSummary)
          scheduleDirtyNotifyEnable('set-mind-map-data')
          setTakeOverAppMethods(message.payload)
          void applyHostMindMapData('set-mind-map-data')
        }
        if (message.type === 'mindMapAiConfig') {
          debugMindMapOpen('postMessage mindMapAiConfig', {
            ...describeHostAiConfig(message.payload),
            appStarted,
            hostAppInitedSent,
            hostAiConfigListenerReady,
            hasBus: !!(window.$bus && typeof window.$bus.$emit === 'function')
          })
          emitHostAiConfig(message.payload, 'postMessage')
        }
        if (message.type === 'mindMapHostSaveStatus') {
          if (!emitOnBus('host_save_status', message.payload)) {
            debugMindMapOpen('mindMapHostSaveStatus skipped: bus unavailable')
          }
        }
        if (message.type === 'mindMapPaneVisibility') {
          const foreground = !!(
            message.payload &&
            typeof message.payload === 'object' &&
            message.payload.foreground === true
          )
          setHostPaneForeground(foreground)
        }
        if (message.type === 'mindMapHostOpenExport') {
          debugMindMapOpen('mindMapHostOpenExport', {
            hasBus: !!(window.$bus && typeof window.$bus.$emit === 'function'),
            hasNativeMindMap: !!nativeMindMap
          })
          if (!emitOnBus('showExport')) {
            debugMindMapOpen('mindMapHostOpenExport skipped: bus unavailable')
          }
        }
        if (message.type === 'mindMapHostOpenImport') {
          debugMindMapOpen('mindMapHostOpenImport', {
            hasBus: !!(window.$bus && typeof window.$bus.$emit === 'function'),
            hasNativeMindMap: !!nativeMindMap
          })
          if (!emitOnBus('showImport')) {
            debugMindMapOpen('mindMapHostOpenImport skipped: bus unavailable')
          }
        }
        if (message.type === 'hostExportDraftThumbnail') {
          const revision = ++mindMapDataRevision
          debugMindMapOpen('hostExportDraftThumbnail', {
            renderEnded,
            hasNativeMindMap: !!nativeMindMap
          })
          runWhenDragIdle(() => void (async () => {
            const exportStart = performance.now()
            const thumbnail = await exportMindMapThumbnailSnapshot(
              'host-export-draft'
            )
            debugMindMapOpen('hostExportDraftThumbnail done', {
              revision,
              elapsed: Math.round(performance.now() - exportStart),
              hasThumbnail: !!thumbnail,
              thumbnailLength: thumbnail ? thumbnail.length : 0
            })
            if (!thumbnail) {
              return
            }
            postToHost('saveMindMapThumbnail', {
              revision,
              thumbnail
            })
          })())
        }
        if (message.type === 'requestMindMapSave') {
          const requestId = message.payload && message.payload.requestId
          const saveStartedAt = performance.now()
          debugMindMapOpen('requestMindMapSave | received', {
            requestId: requestId || null,
            hasNativeMindMap: !!nativeMindMap,
            bridgeReady: !!window.takeOverAppMethods,
            renderEnded,
            concurrentInFlight: nativeSaveInFlight
              ? {
                  requestId: nativeSaveInFlight.requestId,
                  phase: nativeSaveInFlight.phase,
                  elapsedMs: Math.round(
                    performance.now() - nativeSaveInFlight.startedAt
                  )
                }
              : null
          })
          if (!nativeMindMap || typeof nativeMindMap.getData !== 'function') {
            reportMindMapSaveProgress(requestId, 'skipped-not-ready', {
              hasNativeMindMap: !!nativeMindMap
            })
            traceNativeMindMapOp('requestMindMapSave.skipNotReady', {
              requestId: requestId || null,
              hasNativeMindMap: !!nativeMindMap
            })
            console.warn(
              '[DEBUG] mindmap-bridge | requestMindMapSave skipped: nativeMindMap not ready',
              { requestId: requestId || null, hasNativeMindMap: !!nativeMindMap }
            )
            return
          }
          if (nativeSaveInFlight) {
            reportMindMapSaveProgress(requestId, 'concurrent', {
              existingRequestId: nativeSaveInFlight.requestId,
              existingPhase: nativeSaveInFlight.phase,
              existingElapsedMs: Math.round(
                performance.now() - nativeSaveInFlight.startedAt
              )
            })
          }
          nativeSaveInFlight = {
            requestId: requestId || null,
            startedAt: saveStartedAt,
            phase: 'snapshot'
          }
          // 拖拽中不做快照/缩略图导出（重活会砸进拖拽帧）；发进度心跳保活
          // 宿主保存协调器的 inactivity 计时，最多等 8s 兜底放行
          if (interactionDragActive) {
            reportMindMapSaveProgress(requestId, 'wait-drag-idle', {
              renderEnded
            })
            const dragIdleReached = await waitForDragIdle(8000)
            reportMindMapSaveProgress(requestId, 'drag-idle-resume', {
              dragIdleReached
            })
          }
          reportMindMapSaveProgress(requestId, 'snapshot', { renderEnded })
          try {
            const snapshotStartedAt = performance.now()
            const snapshotData = await collectMindMapDataForSnapshot(
              'request-save',
              { ensureRendered: false }
            )
            if (!snapshotData) {
              reportMindMapSaveProgress(requestId, 'failed', {
                message: 'MindMap snapshot not settled'
              })
              traceNativeMindMapOp('requestMindMapSave.skipUnsettled', {
                requestId: requestId || null
              })
              return
            }
            bridgeState.mindMapData = snapshotData
            traceNativeMindMapOp('requestMindMapSave.snapshot', () => ({
              requestId: requestId || null,
              snapshotMs: Math.round(performance.now() - snapshotStartedAt),
              data: summarizeNativeMindMapDataForTrace(bridgeState.mindMapData)
            }))
            reportMindMapSaveProgress(requestId, 'thumbnail', {
              snapshotMs: Math.round(performance.now() - snapshotStartedAt),
              renderEnded
            })
            const thumbStartedAt = performance.now()
            let thumbnail = null
            try {
              thumbnail = await exportMindMapThumbnailSnapshot(
                'request-save'
              )
            } catch (error) {
              debugMindMapOpen('requestMindMapSave | thumbnail export failed', {
                requestId: requestId || null,
                message: error && error.message ? error.message : String(error)
              })
              console.warn('Failed to export MindMap save thumbnail', error)
            }
            reportMindMapSaveProgress(requestId, 'post', {
              snapshotMs: Math.round(performance.now() - snapshotStartedAt),
              thumbnailMs: Math.round(performance.now() - thumbStartedAt),
              hasThumbnail: !!thumbnail
            })
            await postMindMapDataToHost(
              bridgeState.mindMapData,
              requestId,
              thumbnail
            )
            debugMindMapOpen('requestMindMapSave | posted', {
              requestId: requestId || null,
              totalMs: Math.round(performance.now() - saveStartedAt),
              hasThumbnail: !!thumbnail
            })
          } catch (error) {
            reportMindMapSaveProgress(requestId, 'failed', {
              phase: nativeSaveInFlight ? nativeSaveInFlight.phase : null,
              totalMs: Math.round(performance.now() - saveStartedAt),
              message: error && error.message ? error.message : String(error)
            })
            return
          } finally {
            nativeSaveInFlight = null
          }
        }
        if (message.type === 'updateRootText') {
          const newText = message.payload && message.payload.text
          if (typeof newText === 'string' && nativeMindMap) {
            const root = nativeMindMap.renderer.root
            if (root) {
              const isRichText = root.getData('richText')
              const textValue = isRichText
                ? '<p>' + newText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>'
                : newText
              root.setText(textValue, isRichText)
              nativeMindMap.render()
            }
          }
        }
        if (
          message.type === 'restoreMindMapView' ||
          message.type === 'MINDMAP_PREVIEW_LOCATE'
        ) {
          const requestId = message.payload && message.payload.requestId
          const reason =
            (message.payload && message.payload.reason) || message.type
          debugMindMapOpen('received locate request', {
            type: message.type,
            requestId: requestId || null,
            reason,
            hasNativeMindMap: !!nativeMindMap,
            hasBus: !!(window.$bus && typeof window.$bus.$emit === 'function'),
            hasFit: typeof nativeMindMap?.view?.fit === 'function',
            scaleBefore: nativeMindMap?.view?.scale || null,
            innerSize: {
              w: window.innerWidth,
              h: window.innerHeight
            }
          })
          const runRestore = () => {
            if (!window.$bus || typeof window.$bus.$emit !== 'function') {
              notifyHostPreviewViewport({
                reason,
                requestId,
                ok: false,
                error: 'bus-unavailable'
              })
              return false
            }
            if (
              !nativeMindMap ||
              typeof nativeMindMap.__nbApplyHostViewport !== 'function'
            ) {
              return false
            }
            window.$bus.$emit('host_restore_preview_view', {
              reason,
              requestId
            })
            return true
          }
          if (!runRestore() && window.$bus && typeof window.$bus.$on === 'function') {
            const onReady = () => {
              window.$bus.$off('app_inited', onReady)
              if (!runRestore()) {
                notifyHostPreviewViewport({
                  reason,
                  requestId,
                  ok: false,
                  error: 'preview-viewport-unavailable'
                })
              }
            }
            window.$bus.$on('app_inited', onReady)
          }
        }
        if (message.type === 'MINDMAP_PREVIEW_RESIZE') {
          debugMindMapOpen('received preview resize', {
            hasNativeMindMap: !!nativeMindMap,
            hasResize: typeof nativeMindMap?.resize === 'function',
            hasApplyPreview:
              typeof nativeMindMap?.__nbApplyHostViewport === 'function',
            innerSize: {
              w: window.innerWidth,
              h: window.innerHeight
            }
          })
          if (
            nativeMindMap &&
            typeof nativeMindMap.__nbApplyHostViewport === 'function' &&
            window.$bus &&
            typeof window.$bus.$emit === 'function'
          ) {
            window.$bus.$emit('host_restore_preview_view', {
              reason: 'preview-resize',
              requestId: null
            })
          }
        }
      })

      const postBridgeReady = () => {
        if (!window.takeOverApp) return
        if (runtimeBlocked || bridgeReadySent) return
        if (!isRuntimeReady()) {
          debugMindMapOpen('postBridgeReady deferred: runtime not ready', {
            hasInitApp: typeof window.initApp === 'function'
          })
          return
        }
        bridgeReadySent = true
        mindmapLoadMark('postBridgeReady', {
          readyState: document.readyState,
          slowResources: getSlowMindMapResources()
        })
        debugMindMapOpen('postBridgeReady', {
          readyState: document.readyState,
          slowResources: getSlowMindMapResources()
        })
        postToHost('ready')
      }
      const waitForRuntimeThenReady = (attempt = 0) => {
        if (!window.takeOverApp) return
        if (runtimeBlocked) return
        if (isRuntimeReady()) {
          mindmapLoadMark('runtime ready', { attempt })
          postBridgeReady()
          return
        }
        if (attempt > 0 && attempt % 10 === 0) {
          mindmapLoadMark('waiting for initApp runtime', {
            attempt,
            hasInitApp: typeof window.initApp === 'function'
          })
        }
        if (attempt >= 80) {
          blockRuntime('runtime-wait-timeout', {
            kind: 'runtime-timeout',
            message:
              'MindMap JS 运行时超时未加载。请部署完整 apps/web/build/mind-map/dist/js/ 并确保静态路径返回 application/javascript（非 HTML 登录页）。'
          })
          return
        }
        window.setTimeout(() => waitForRuntimeThenReady(attempt + 1), 100)
      }
      // Use addEventListener so webpack-dev-server cannot clobber window.onload.
      window.addEventListener('load', () => waitForRuntimeThenReady())
      if (document.readyState === 'complete') {
        waitForRuntimeThenReady()
      }
    
})();
