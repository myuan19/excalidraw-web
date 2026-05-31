/* MindMap iframe host-takeover runtime. Built into public/mind-map via copy.js */
;(function () {
      const bridgeSource = 'simple-mind-map-native'
      const hostSource = 'excalidraw-web'
      const bridgeStartedAt = performance.now()
      const isMindMapDebugEnabled = () => {
        if (window.__MINDMAP_DEBUG__ === true) return true
        try {
          const params = new URLSearchParams(window.location.search)
          return (
            params.get('mindmapDebug') === '1' ||
            window.localStorage.getItem('mindmapDebug') === '1'
          )
        } catch (error) {
          return false
        }
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
              text: '<p>根节点</p>',
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
      const emitOnBus = (event, payload) => {
        if (window.$bus && typeof window.$bus.$emit === 'function') {
          window.$bus.$emit(event, payload)
          return true
        }
        return false
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
                '（若返回 HTML/404，请整包部署 mind-map/dist/js 并放行静态路径）',
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
      const getMindMapThumbnail = async () => {
        if (!nativeMindMap || typeof nativeMindMap.export !== 'function') {
          return null
        }
        try {
          return await nativeMindMap.export('svg', false, 'MindMap')
        } catch (error) {
          console.warn('Failed to export MindMap thumbnail', error)
          return null
        }
      }
      const scheduleDraftThumbnailExport = revision => {
        draftThumbExportRevision = revision
        window.clearTimeout(draftThumbExportTimer)
        draftThumbExportTimer = window.setTimeout(async () => {
          draftThumbExportTimer = null
          const revisionAtExport = draftThumbExportRevision
          const exportStart = performance.now()
          const thumbnail = await getMindMapThumbnail()
          debugMindMapOpen('draft thumbnail export done', {
            revision: revisionAtExport,
            elapsed: Math.round(performance.now() - exportStart),
            hasThumbnail: !!thumbnail,
            thumbnailLength: thumbnail ? thumbnail.length : 0
          })
          if (!thumbnail) return
          postToHost('saveMindMapThumbnail', {
            revision: revisionAtExport,
            thumbnail
          })
        }, DRAFT_THUMB_EXPORT_DEBOUNCE_MS)
      }
      const postMindMapDataToHost = async (data, requestId) => {
        const revision = ++mindMapDataRevision
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
          const thumbnail = await getMindMapThumbnail()
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
            thumbnail
          })
          return
        }
        debugMindMapOpen('postMindMapDataToHost draft data push', {
          revision,
          rootChildren:
            data && data.root && data.root.children
              ? data.root.children.length
              : 0
        })
        postToHost('saveMindMapData', {
          revision,
          data,
          thumbnail: null
        })
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
        debugMindMapOpen('notifyHostAppInited (after render)', {
          totalElapsed: Math.round(performance.now() - bridgeStartedAt),
          hasExport: typeof nativeMindMap?.export === 'function',
          scale: nativeMindMap?.view?.scale || null,
          slowResources: getSlowMindMapResources()
        })
        postToHost('appInited')
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
        window.$bus.$on('data_change', () => {
          postToHost('mindMapDirtyState', { dirty: true })
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
        debugMindMapOpen('before window.initApp')
        window.initApp()
        debugMindMapOpen('after window.initApp call')
      }

      window.addEventListener('message', event => {
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
        if (message.type === 'initMindMap') {
          debugMindMapOpen('received initMindMap message', {
            appStarted,
            hostAppInitedSent,
            hasNativeMindMap: !!nativeMindMap
          })
          if (appStarted && nativeMindMap && hostAppInitedSent) {
            setTakeOverAppMethods(message.payload)
            if (typeof nativeMindMap.setFullData === 'function') {
              nativeMindMap.setFullData(bridgeState.mindMapData)
            }
            return
          }
          startTakeOverApp(message.payload)
        }
        if (message.type === 'setMindMapData') {
          debugMindMapOpen('received setMindMapData message')
          setTakeOverAppMethods(message.payload)
          if (
            nativeMindMap &&
            typeof nativeMindMap.setFullData === 'function'
          ) {
            nativeMindMap.setFullData(bridgeState.mindMapData)
          }
        }
        if (message.type === 'mindMapAiConfig') {
          if (!emitOnBus('host_ai_config', message.payload)) {
            debugMindMapOpen('mindMapAiConfig skipped: bus unavailable')
          }
        }
        if (message.type === 'mindMapHostSaveStatus') {
          if (!emitOnBus('host_save_status', message.payload)) {
            debugMindMapOpen('mindMapHostSaveStatus skipped: bus unavailable')
          }
        }
        if (message.type === 'requestMindMapSave') {
          const requestId = message.payload && message.payload.requestId
          debugMindMapOpen('received requestMindMapSave', {
            requestId: requestId || null,
            hasNativeMindMap: !!nativeMindMap,
            bridgeReady: !!window.takeOverAppMethods
          })
          if (!nativeMindMap || typeof nativeMindMap.getData !== 'function') {
            console.warn(
              '[DEBUG] mindmap-bridge | requestMindMapSave skipped: nativeMindMap not ready',
              { requestId: requestId || null, hasNativeMindMap: !!nativeMindMap }
            )
            return
          }
          if (nativeMindMap && typeof nativeMindMap.getData === 'function') {
            bridgeState.mindMapData = nativeMindMap.getData(true)
          }
          postMindMapDataToHost(bridgeState.mindMapData, requestId)
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
          postBridgeReady()
          return
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
