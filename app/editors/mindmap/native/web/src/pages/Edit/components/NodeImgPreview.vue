<template>
  <viewer :images="images">
    <img v-for="src in images" :key="src" :src="src" />
  </viewer>
</template>

<script>
const DBG = (...args) => console.log('[DEBUG] NodeImgPreview |', ...args)

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
    DBG('mounted | bind node_img_preview')
    this.mindMap.on('node_img_preview', this.onNodeImgPreview)
  },
  beforeDestroy() {
    DBG('beforeDestroy | unbind node_img_preview')
    this.mindMap.off('node_img_preview', this.onNodeImgPreview)
  },
  methods: {
    onNodeImgPreview(node, e) {
      DBG('onNodeImgPreview | received | nodeUid:', node && node.uid,
          '| hasEvent:', !!e,
          '| hasNodeImgSelect:', !!(this.mindMap && this.mindMap.nodeImgSelect))
      if (e) {
        e.stopPropagation()
        e.preventDefault()
      }
      const imgUrl = node.getImageUrl()
      if (!imgUrl) {
        DBG('onNodeImgPreview | abort: empty image url')
        return
      }
      if (this.mindMap.nodeImgSelect) {
        DBG('onNodeImgPreview | hide selection before viewer')
        this.mindMap.nodeImgSelect.hideSelectionForPreview()
      }
      this.images = [imgUrl]
      DBG('onNodeImgPreview | open viewer | image length:', imgUrl.length,
          '| zIndex:', 2147483001)
      this.$viewerApi({
        images: this.images,
        options: {
          zIndex: 2147483001,
          zIndexInline: 2147483001
        }
      })
    }
  }
}
</script>

<style></style>
