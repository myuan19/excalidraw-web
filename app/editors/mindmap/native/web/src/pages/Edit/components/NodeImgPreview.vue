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
      console.log('[DEBUG] NodeImgPreview.onNodeImgPreview | hasNode:', !!node, '| hasEvent:', !!e)
      if (e) {
        e.stopPropagation()
        e.preventDefault()
      }
      const imgUrl = node.getImageUrl()
      console.log('[DEBUG] NodeImgPreview.onNodeImgPreview | imgUrl存在:', !!imgUrl, '| urlLen:', imgUrl?.length)
      this.images = [imgUrl]
      this.$viewerApi({
        images: this.images
      })
      console.log('[DEBUG] NodeImgPreview.onNodeImgPreview | viewerApi 已调用')
    }
  }
}
</script>

<style></style>
