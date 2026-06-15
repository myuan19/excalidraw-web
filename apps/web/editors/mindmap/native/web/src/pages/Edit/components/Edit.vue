<template>
  <div class="mindmap-edit"></div>
</template>

<script>
const EDITOR_FOCUSED_ROOT_SCREEN_RATIO_MULTIPLIER = 0.58;

export default {
  name: "MindMapEdit",
  methods: {
    applyEmbedFocusedViewport() {
      return this.applyEditorFocusedViewport();
    },
    applyEditorFocusedViewport() {
      this.notifyEmbedPreviewViewportApplied();
    },
    notifyEmbedPreviewViewportApplied() {
      window.parent?.postMessage(
        {
          source: "simple-mind-map-native",
          type: "embed_preview_viewport_applied",
          ratio: EDITOR_FOCUSED_ROOT_SCREEN_RATIO_MULTIPLIER,
        },
        "*",
      );
    },
  },
};
</script>
