/* MindMap iframe host-takeover runtime. Built into public/mind-map via copy.js */
;(function () {
      // Must match app/editors/mindmap/mindMapDraftState.ts NATIVE_HYDRATE_SETTLE_MS
      const DIRTY_NOTIFY_SETTLE_MS = 2500
      const bridgeSource = 'simple-mind-map-native'
      const hostSource = 'excalidraw-web'
      const bridgeStartedAt = performance.now()
      const isMindMapDebugEnabled = () => {
        if (window.__MINDMAP_DEBUG__ === true) return true
        try {
          const params = new URLSearchParams(window.location.search)
          if (
            params.get('mindmapDebug') === '1' ||
            params.get('mindmapLoadDebug') === '1' ||
            window.localStorage.getItem('mindmapDebug') === '1' ||
            window.localStorage.getItem('mindmapLoadDebug') === '1'
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
      const summarizeMindMapPayloadIntegrity = data => {
        const plainFromHtml = value => {
          return String(value || '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p\s*>/gi, '\n')
            .replace(/<[^>]*>/g, '')
            .replace(/\u00a0/g, ' ')
            .trim()
        }
        const totals = {
          nodeCount: 0,
          emptyTextCount: 0,
          rootChildren: 0,
          collapsedWithChildrenCount: 0,
          maxDepth: 0
        }
        const walk = (node, depth) => {
          if (!node || !node.data) return
          totals.nodeCount += 1
          totals.maxDepth = Math.max(totals.maxDepth, depth)
          if (!plainFromHtml(node.data.text)) {
            totals.emptyTextCount += 1
          }
          const children = node.children || []
          if (node.data.expand === false && children.length > 0) {
            totals.collapsedWithChildrenCount += 1
          }
          children.forEach(child => walk(child, depth + 1))
        }
        if (data && data.root) {
          totals.rootChildren = (data.root.children || []).length
          walk(data.root, 1)
        }
        return totals
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
          ;(node.children || []).forEach(walk)
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
      const defaultBridgeState = {
        mindMapData: {
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
        },
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
      let draftThumbExportQueued = false
      let draftThumbExportInFlight = false
      let draftThumbExportRequestedDuringFlight = false
      let draftThumbExportRevision = 0
      let nativeSaveInFlight = null
      let dirtyNotifyEnabled = false
      let dirtyNotifyEnableTimer = null
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
      const reportMindMapSaveProgress = (requestId, phase, extra) => {
        if (nativeSaveInFlight && phase !== 'skipped-not-ready' && phase !== 'failed' && phase !== 'concurrent') {
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
      const waitForNextFrame = () => {
        return new Promise(resolve => {
          if (window.requestAnimationFrame) {
            window.requestAnimationFrame(() => resolve())
            return
          }
          window.setTimeout(resolve, 0)
        })
      }
      const syncPendingTextEditForSnapshot = async reason => {
        const textEdit =
          nativeMindMap &&
          nativeMindMap.renderer &&
          nativeMindMap.renderer.textEdit
        if (
          !textEdit ||
          typeof textEdit.syncEditingTextToNode !== 'function' ||
          (typeof textEdit.isShowTextEdit === 'function' &&
            !textEdit.isShowTextEdit())
        ) {
          return false
        }
        try {
          const synced = textEdit.syncEditingTextToNode()
          if (synced && typeof synced.then === 'function') {
            await synced
          }
          await waitForNodeTreeRenderEnd('sync-text-edit')
          debugMindMapOpen('synced text edit before snapshot', {
            reason,
            synced: !!synced
          })
          return !!synced
        } catch (error) {
          console.warn('Failed to sync MindMap text edit before snapshot', error)
          return false
        }
      }
      const getMindMapThumbnail = async () => {
        if (!nativeMindMap || typeof nativeMindMap.export !== 'function') {
          return null
        }
        try {
          return await nativeMindMap.export('svg', false, 'MindMap', {
            preserveTextEdit: true
          })
        } catch (error) {
          console.warn('Failed to export MindMap thumbnail', error)
          return null
        }
      }
      // 渲染等待回退上限：node_tree_render_end 事件迟迟不来（或根本不会触发）时，
      // 等待不再无限挂起，而是回退继续并补发一次心跳。这是历史「原生界面未响应保存请求」
      // 真·卡死（save 永远等不到渲染事件）的根因修复。必须 < 宿主静默超时，
      // 以保证保存管线持续向宿主发 mindMapSaveProgress，不被判定为卡死。
      const NODE_TREE_RENDER_WAIT_TIMEOUT_MS = 8000
      const waitForNodeTreeRenderEnd = reason => {
        return new Promise(resolve => {
          const waitStartedAt = performance.now()
          const requestId =
            nativeSaveInFlight && nativeSaveInFlight.requestId
              ? nativeSaveInFlight.requestId
              : null
          if (reason) {
            debugMindMapOpen('wait node_tree_render_end start', {
              reason,
              requestId,
              renderEnded
            })
            if (requestId && nativeSaveInFlight) {
              reportMindMapSaveProgress(requestId, nativeSaveInFlight.phase, {
                waitReason: reason
              })
            }
          }
          let settled = false
          let fallbackTimer = null
          const finish = timedOut => {
            if (settled) return
            settled = true
            if (fallbackTimer != null) {
              window.clearTimeout(fallbackTimer)
              fallbackTimer = null
            }
            if (window.$bus && typeof window.$bus.$off === 'function') {
              window.$bus.$off('node_tree_render_end', onRenderEnd)
            }
            if (reason) {
              debugMindMapOpen('wait node_tree_render_end done', {
                reason,
                requestId,
                waitMs: Math.round(performance.now() - waitStartedAt),
                timedOut: !!timedOut
              })
            }
            // 回退继续时补发心跳，向宿主表明 native 仍在推进（而非卡死）。
            if (timedOut && requestId && nativeSaveInFlight) {
              reportMindMapSaveProgress(requestId, nativeSaveInFlight.phase, {
                waitReason: reason
                  ? reason + ':render-wait-timeout'
                  : 'render-wait-timeout',
                renderWaitTimedOut: true
              })
            }
            resolve()
          }
          const onRenderEnd = () => finish(false)
          if (window.$bus && typeof window.$bus.$once === 'function') {
            window.$bus.$once('node_tree_render_end', onRenderEnd)
            fallbackTimer = window.setTimeout(
              () => finish(true),
              NODE_TREE_RENDER_WAIT_TIMEOUT_MS
            )
            return
          }
          window.setTimeout(() => finish(false), 0)
        })
      }
      const countSnapshotNodes = data =>
        summarizeMindMapPayloadIntegrity(data).nodeCount
      const collectMindMapSaveSnapshot = async (requestId, reason) => {
        if (!nativeMindMap || typeof nativeMindMap.getData !== 'function') {
          return null
        }
        await syncPendingTextEditForSnapshot(reason || 'request-save')
        if (!renderEnded) {
          await waitForNodeTreeRenderEnd('collect-snapshot')
        }
        const data = nativeMindMap.getData(true, {
          skipTextSync: true,
          usePersistCopy: true
        })
        if (isMindMapDebugEnabled()) {
          debugMindMapOpen('request-save snapshot collected', {
            requestId: requestId || null,
            ...summarizeMindMapPayloadIntegrity(data)
          })
        }
        return data
      }
      const ensureCanvasMatchesSnapshot = async snapshotData => {
        if (
          !nativeMindMap ||
          !snapshotData ||
          typeof nativeMindMap.getData !== 'function' ||
          typeof nativeMindMap.setFullData !== 'function'
        ) {
          return false
        }
        const liveData = nativeMindMap.getData(true, { skipTextSync: true })
        const snapCount = countSnapshotNodes(snapshotData)
        const liveCount = countSnapshotNodes(liveData)
        if (snapCount === liveCount) {
          return false
        }
        debugMindMapOpen('snapshot thumbnail canvas resync', {
          snapCount,
          liveCount
        })
        nativeMindMap.setFullData(snapshotData)
        renderEnded = false
        await waitForNodeTreeRenderEnd('canvas-resync')
        return true
      }
      const exportThumbnailForSnapshot = async (snapshotData, reason) => {
        if (!nativeMindMap) {
          return null
        }
        await ensureCanvasMatchesSnapshot(snapshotData)
        const needsForceLoad =
          (nativeMindMap.opt && nativeMindMap.opt.openPerformance) ||
          !renderEnded
        if (
          needsForceLoad &&
          nativeMindMap.renderer &&
          typeof nativeMindMap.renderer.forceLoadNode === 'function'
        ) {
          renderEnded = false
          nativeMindMap.renderer.forceLoadNode()
          await waitForNodeTreeRenderEnd('export-thumbnail-force-load')
        } else if (!renderEnded) {
          debugMindMapOpen('snapshot thumbnail export waiting for render end', {
            reason
          })
          await waitForNodeTreeRenderEnd('export-thumbnail-render')
        }
        const exportStart = performance.now()
        const thumbnail = await getMindMapThumbnail()
        debugMindMapOpen('snapshot thumbnail export done', {
          reason,
          elapsed: Math.round(performance.now() - exportStart),
          hasThumbnail: !!thumbnail,
          thumbnailLength: thumbnail ? thumbnail.length : 0,
          snapshotNodeCount: countSnapshotNodes(snapshotData)
        })
        return thumbnail
      }
      const exportMindMapThumbnailSnapshot = async (revisionAtExport, reason) => {
        if (!nativeMindMap) {
          debugMindMapOpen('draft thumbnail export skipped (no mind map)', {
            revision: revisionAtExport,
            reason
          })
          return null
        }
        await syncPendingTextEditForSnapshot(reason || 'draft-thumbnail')
        const snapshotData =
          typeof nativeMindMap.getData === 'function'
            ? nativeMindMap.getData(true, {
                skipTextSync: true,
                usePersistCopy: true
              })
            : null
        const thumbnail = await exportThumbnailForSnapshot(
          snapshotData,
          reason || 'draft-thumbnail'
        )
        if (!thumbnail) {
          return null
        }
        postToHost('saveMindMapThumbnail', {
          revision: revisionAtExport,
          thumbnail
        })
        return thumbnail
      }
      const scheduleDraftThumbnailExport = revision => {
        draftThumbExportRevision = revision
        if (draftThumbExportInFlight) {
          draftThumbExportRequestedDuringFlight = true
          return
        }
        if (draftThumbExportQueued) {
          return
        }
        draftThumbExportQueued = true
        const runWhenReady = async () => {
          draftThumbExportQueued = false
          draftThumbExportInFlight = true
          const revisionAtExport = draftThumbExportRevision
          try {
            await exportMindMapThumbnailSnapshot(
              revisionAtExport,
              'schedule-draft-thumbnail'
            )
          } finally {
            draftThumbExportInFlight = false
            if (
              draftThumbExportRequestedDuringFlight &&
              draftThumbExportRevision !== revisionAtExport
            ) {
              draftThumbExportRequestedDuringFlight = false
              scheduleDraftThumbnailExport(draftThumbExportRevision)
            } else {
              draftThumbExportRequestedDuringFlight = false
            }
          }
        }
        void waitForNextFrame().then(runWhenReady)
      }
      const postMindMapDataToHost = async (data, requestId, thumbnail = null) => {
        const revision = ++mindMapDataRevision
        if (requestId) {
          debugMindMapOpen('postMindMapDataToHost request-save', {
            requestId,
            revision,
            rootChildren:
              data && data.root && data.root.children
                ? data.root.children.length
                : 0,
            hasThumbnail: !!thumbnail
          })
          postToHost('saveMindMapData', {
            requestId,
            revision,
            data,
            thumbnail: thumbnail || null
          })
          if (!thumbnail) {
            scheduleDraftThumbnailExport(revision)
          }
          return
        }
        if (!dirtyNotifyEnabled) {
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
        const sampleText = (() => {
          let sample = ''
          const walk = node => {
            if (sample || !node || !node.data) return
            const text = String(node.data.text || '')
            if (text.includes('<strong') || text.includes('ql-indent-')) {
              sample = text
              return
            }
            ;(node.children || []).forEach(walk)
          }
          if (data && data.root) walk(data.root)
          return sample
        })()
        debugMindMapOpen('postMindMapDataToHost draft data push', {
          revision,
          rootChildren:
            data && data.root && data.root.children
              ? data.root.children.length
              : 0,
          sampleStrongCount: sampleText
            ? (sampleText.match(/<strong\b/gi) || []).length
            : 0,
          sampleTextLen: sampleText.length
        })
        postToHost('saveMindMapData', {
          revision,
          data,
          thumbnail: null
        })
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
      const applyHostMindMapData = reason => {
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
          return
        }
        nativeMindMap.setFullData(data)
      }
      const setTakeOverAppMethods = data => {
        bridgeState = {
          ...defaultBridgeState,
          ...(data || {})
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
          bridgeState.mindMapData = data
          postMindMapDataToHost(data)
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
          if (!dirtyNotifyEnabled && !forceUserEdit) {
            debugMindMapOpen(
              'dirty notify suppressed',
              {
                ...describeDirtyNotifyWindow(),
                reason: opts.reason || null,
                source: opts.source || null,
                userEdit: forceUserEdit
              }
            )
            return
          }
          debugMindMapOpen('dirty notify emit', {
            phase: forceUserEdit ? 'text-edit' : 'data-change',
            forced: forceUserEdit && !dirtyNotifyEnabled,
            reason: opts.reason || null,
            source: opts.source || null,
            integrity: opts.integrity || null
          })
          postToHost('mindMapDirtyState', {
            dirty: true,
            userEdit: forceUserEdit,
            reason: opts.reason || null,
            source: opts.source || null
          })
        }
        window.$bus.$on('data_change', data => {
          const integrity = summarizeMindMapPayloadIntegrity(data)
          debugMindMapOpen('bus data_change received', {
            dirtyNotifyEnabled,
            integrity
          })
          notifyDirty({
            reason: 'bus:data_change',
            source: 'bus:data_change',
            integrity
          })
        })
        window.$bus.$on('hide_text_edit', () => {
          if (textEditDirtyTimer) {
            clearTimeout(textEditDirtyTimer)
            textEditDirtyTimer = null
          }
        })
        window.$bus.$on('view_data_change', viewData => {
          debugMindMapOpen('bus view_data_change received', {
            hasViewData: !!viewData,
            keys:
              viewData && typeof viewData === 'object'
                ? Object.keys(viewData).slice(0, 8)
                : [],
            dirtyNotifyEnabled
          })
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
          // 直接在 mindMap 实例上监听文本编辑变化（不通过 $bus 转发，避免触发 RichText 内部错误）
          nativeMindMap.on('node_text_edit_change', () => {
            if (textEditDirtyTimer) return
            notifyDirty({ userEdit: true, reason: 'text-edit' })
            textEditDirtyTimer = setTimeout(() => {
              textEditDirtyTimer = null
            }, 150)
          })
          nativeMindMap.on('afterExecCommand', commandName => {
            if (!userEditCommandNames.has(commandName)) {
              debugMindMapOpen('afterExecCommand ignored for dirty', {
                commandName,
                dirtyNotifyEnabled
              })
              return
            }
            notifyDirty({
              userEdit: true,
              reason: `command:${commandName}`,
              source: 'afterExecCommand'
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
            applyHostMindMapData('init-mind-map-repeat')
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
          applyHostMindMapData('set-mind-map-data')
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
          debugMindMapOpen('hostExportDraftThumbnail', {
            renderEnded,
            hasNativeMindMap: !!nativeMindMap
          })
          scheduleDraftThumbnailExport(++mindMapDataRevision)
        }
        if (message.type === 'requestMindMapSave') {
          const requestId = message.payload && message.payload.requestId
          const saveStartedAt = performance.now()
          debugMindMapOpen('requestMindMapSave | received', {
            requestId: requestId || null,
            hasNativeMindMap: !!nativeMindMap,
            bridgeReady: !!window.takeOverAppMethods,
            renderEnded,
            openPerformance: !!(
              nativeMindMap &&
              nativeMindMap.opt &&
              nativeMindMap.opt.openPerformance
            ),
            draftThumbExportInFlight,
            concurrentInFlight: nativeSaveInFlight
              ? {
                  requestId: nativeSaveInFlight.requestId,
                  phase: nativeSaveInFlight.phase,
                  elapsedMs: Math.round(
                    performance.now() - nativeSaveInFlight.startedAt
                  )
                }
              : null,
            ...describeDirtyNotifyWindow()
          })
          if (!nativeMindMap || typeof nativeMindMap.getData !== 'function') {
            reportMindMapSaveProgress(requestId, 'skipped-not-ready', {
              hasNativeMindMap: !!nativeMindMap
            })
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
          reportMindMapSaveProgress(requestId, 'snapshot', { renderEnded })
          try {
            const snapshotStartedAt = performance.now()
            debugMindMapOpen('requestMindMapSave | snapshot start', {
              requestId: requestId || null,
              renderEnded
            })
            bridgeState.mindMapData =
              (await collectMindMapSaveSnapshot(requestId, 'request-save')) ||
              bridgeState.mindMapData
            debugMindMapOpen('requestMindMapSave | snapshot done', {
              requestId: requestId || null,
              snapshotMs: Math.round(performance.now() - snapshotStartedAt),
              ...summarizeMindMapPayloadIntegrity(bridgeState.mindMapData)
            })
            reportMindMapSaveProgress(requestId, 'thumbnail', {
              snapshotMs: Math.round(performance.now() - snapshotStartedAt),
              openPerformance: !!(
                nativeMindMap.opt && nativeMindMap.opt.openPerformance
              ),
              renderEnded
            })
            const thumbStartedAt = performance.now()
            debugMindMapOpen('requestMindMapSave | thumbnail start', {
              requestId: requestId || null,
              openPerformance: !!(
                nativeMindMap.opt && nativeMindMap.opt.openPerformance
              ),
              renderEnded
            })
            let thumbnail = null
            try {
              thumbnail = await exportThumbnailForSnapshot(
                bridgeState.mindMapData,
                'request-save'
              )
            } catch (error) {
              debugMindMapOpen('requestMindMapSave | thumbnail export failed', {
                requestId: requestId || null,
                message: error && error.message ? error.message : String(error)
              })
              console.warn('Failed to export MindMap save thumbnail', error)
            }
            debugMindMapOpen('requestMindMapSave | thumbnail done', {
              requestId: requestId || null,
              thumbnailMs: Math.round(performance.now() - thumbStartedAt),
              hasThumbnail: !!thumbnail,
              thumbnailLength: thumbnail ? thumbnail.length : 0
            })
            reportMindMapSaveProgress(requestId, 'post', {
              snapshotMs: Math.round(performance.now() - snapshotStartedAt),
              thumbnailMs: Math.round(performance.now() - thumbStartedAt),
              hasThumbnail: !!thumbnail
            })
            postMindMapDataToHost(
              bridgeState.mindMapData,
              requestId,
              thumbnail
            )
            debugMindMapOpen('requestMindMapSave | posted', {
              requestId: requestId || null,
              totalMs: Math.round(performance.now() - saveStartedAt),
              hasThumbnail: !!thumbnail
            })
            reportMindMapSaveProgress(requestId, 'done', {
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
              'MindMap JS 运行时超时未加载。请部署完整 app/build/mind-map/dist/js/ 并确保静态路径返回 application/javascript（非 HTML 登录页）。'
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
