// EditorHub MindMap iframe bridge shell（宿主 ↔ native runtime）
(function () {
  var NATIVE_SOURCE = "simple-mind-map-native";

  function postToHost(type, payload) {
    window.parent?.postMessage(
      { source: NATIVE_SOURCE, type: type, ...(payload || {}) },
      "*",
    );
  }

  window.takeOverApp = window.parent !== window;
  window.__editorhubMindMapBridge = {
    source: NATIVE_SOURCE,
    startTakeOverApp: function (payload) {
      return window.startTakeOverApp?.(payload);
    },
    isRuntimeReady: function () {
      return !!window.isRuntimeReady?.();
    },
    postToHost: postToHost,
  };

  postToHost('ready');
  postToHost('appInited');
  postToHost('host_restore_preview_view', { ok: true });
})();
