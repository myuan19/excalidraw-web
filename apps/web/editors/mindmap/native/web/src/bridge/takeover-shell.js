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

  // ready 由 app 模块在 message 监听器注册后再发送，避免宿主 postInit 早于 iframe 监听而丢失。
})();
