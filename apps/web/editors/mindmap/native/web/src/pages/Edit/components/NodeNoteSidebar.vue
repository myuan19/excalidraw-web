<template>
  <Sidebar :title="$t('note.title')" panelKey="noteSidebar">
    <div class="noteContentWrap" ref="noteContentWrap"></div>
  </Sidebar>
</template>

<script>
import Sidebar from './Sidebar.vue'
import { mapState, mapMutations } from 'vuex'

let toastViewerPromise = null

function resolveToastConstructor(mod, name) {
  const candidates = [
    mod && mod.default,
    mod && mod[name],
    mod && mod.default && mod.default.default,
    mod && mod.default && mod.default[name],
    mod
  ]
  const ctor = candidates.find(candidate => typeof candidate === 'function')
  if (!ctor) {
    throw new Error(`Toast UI ${name} export is unavailable`)
  }
  return ctor
}

async function loadToastViewer() {
  if (!toastViewerPromise) {
    toastViewerPromise = Promise.all([
      import('@toast-ui/editor/dist/toastui-editor-viewer'),
      import('@toast-ui/editor/dist/toastui-editor-viewer.css')
    ]).then(([mod]) => resolveToastConstructor(mod, 'Viewer'))
  }
  return toastViewerPromise
}

export default {
  components: {
    Sidebar
  },
  props: {
    mindMap: {
      type: Object
    }
  },
  data() {
    return {
      editor: null,
      node: null
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark,
      activeSidebar: state => state.activeSidebar
    })
  },
  created() {
    this.$bus.$on('node_active', this.onNodeActive)
    this.mindMap.on('node_note_click', this.onNodeNoteClick)
  },
  beforeDestroy() {
    this.$bus.$off('node_active', this.onNodeActive)
    this.mindMap.off('node_note_click', this.onNodeNoteClick)
  },
  methods: {
    ...mapMutations(['setActiveSidebar']),

    onNodeActive(...args) {
      if (this.activeSidebar !== 'noteSidebar') {
        return
      }
      const nodes = [...args[1]]
      if (nodes.length > 0) {
        if (nodes[0] !== this.node) {
          this.setActiveSidebar(null)
        }
      } else {
        this.setActiveSidebar(null)
      }
    },

    // 初始化编辑器
    async initEditor() {
      if (!this.editor) {
        const Viewer = await loadToastViewer()
        this.editor = new Viewer({
          el: this.$refs.noteContentWrap
        })
      }
    },

    async onNodeNoteClick(node) {
      this.node = node
      this.setActiveSidebar('noteSidebar')
      await this.initEditor()
      this.setViewerHTML(node.getData('note') || '')
    },

    setViewerHTML(content) {
      const html = content || ''
      if (this.editor && typeof this.editor.setHTML === 'function') {
        this.editor.setHTML(html)
        return
      }
      if (
        this.editor &&
        this.editor.preview &&
        typeof this.editor.preview.setHTML === 'function'
      ) {
        this.editor.preview.setHTML(html)
        return
      }
      this.$refs.noteContentWrap.innerHTML = html
    }
  }
}
</script>

<style lang="less" scoped>
.noteContentWrap {
  padding: 12px 20px;
}
</style>
