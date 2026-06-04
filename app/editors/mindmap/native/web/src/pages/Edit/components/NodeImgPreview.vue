<template>
  <viewer :images="images">
    <img v-for="src in images" :key="src" :src="src" />
  </viewer>
</template>

<script>
export default {
  props: {
    mindMap: {
      type: Object,
      default() {
        return null
      }
    }
  },
  data() {
    return {
      images: []
    }
  },
  mounted() {
    this.mindMap.on('node_img_dblclick', this.onNodeImgPreview)
    this.mindMap.on('node_img_preview', this.onNodeImgPreview)
  },
  beforeDestroy() {
    this.mindMap.off('node_img_dblclick', this.onNodeImgPreview)
    this.mindMap.off('node_img_preview', this.onNodeImgPreview)
  },
  methods: {
    onNodeImgPreview(node, e) {
      if (e) {
        e.stopPropagation()
        e.preventDefault()
      }
      this.images = [node.getImageUrl()]
      this.$viewerApi({
        images: this.images
      })
    }
  }
}
</script>

<style></style>
