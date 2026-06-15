<template>
  <el-dialog
    class="nodeHyperlinkDialog"
    v-bind="nodeDialogProps"
    :title="$t('nodeHyperlink.title')"
    :visible.sync="dialogVisible"
    :width="isMobile ? '90%' : '50%'"
    :top="isMobile ? '20px' : '15vh'"
  >
    <div class="item">
      <span class="name">{{ $t('nodeHyperlink.link') }}</span>
      <el-input
        v-model="link"
        size="mini"
        placeholder="example.com 或 https://example.com"
        @keyup.native.stop
        @keydown.native.stop
      ></el-input>
    </div>
    <div class="item">
      <span class="name">{{ $t('nodeHyperlink.name') }}</span>
      <el-input
        v-model="linkTitle"
        size="mini"
        @keyup.native.stop
        @keydown.native.stop
      ></el-input>
    </div>
    <span slot="footer" class="dialog-footer">
      <el-button @click="cancel">{{ $t('dialog.cancel') }}</el-button>
      <el-button type="primary" @click="confirm">{{
        $t('dialog.confirm')
      }}</el-button>
    </span>
  </el-dialog>
</template>

<script>
import {
  NODE_DIALOG_PROPS,
  normalizeNodeHyperlinkUrl,
  stripUrlProtocol
} from '@/utils/nodeDialogOptions'
import { isMobile } from 'simple-mind-map/src/utils/index'

// 节点超链接内容设置
export default {
  data() {
    return {
      nodeDialogProps: NODE_DIALOG_PROPS,
      dialogVisible: false,
      link: '',
      linkTitle: '',
      activeNodes: [],
      isMobile: isMobile()
    }
  },
  created() {
    this.$bus.$on('node_active', this.handleNodeActive)
    this.$bus.$on('showNodeLink', this.handleShowNodeLink)
  },
  beforeDestroy() {
    this.$bus.$off('node_active', this.handleNodeActive)
    this.$bus.$off('showNodeLink', this.handleShowNodeLink)
  },
  methods: {
    handleNodeActive(...args) {
      this.activeNodes = [...args[1]]
      this.syncFieldsFromActiveNode()
    },

    syncFieldsFromActiveNode() {
      if (this.activeNodes.length > 0) {
        const firstNode = this.activeNodes[0]
        this.link = stripUrlProtocol(firstNode.getData('hyperlink'))
        this.linkTitle = firstNode.getData('hyperlinkTitle') || ''
      } else {
        this.link = ''
        this.linkTitle = ''
      }
    },

    handleShowNodeLink() {
      this.syncFieldsFromActiveNode()
      this.dialogVisible = true
    },

    cancel() {
      this.dialogVisible = false
    },

    confirm() {
      const href = normalizeNodeHyperlinkUrl(this.link)
      const title = (this.linkTitle || '').trim()
      const shouldClear = !href && !title

      this.activeNodes.forEach(node => {
        if (shouldClear) {
          node.setHyperlink('', '')
        } else {
          node.setHyperlink(href, title)
        }
      })
      this.cancel()
    }
  }
}
</script>

<style lang="less" scoped>
.nodeHyperlinkDialog {
  .item {
    display: flex;
    align-items: center;
    margin-bottom: 10px;

    .name {
      display: block;
      width: 50px;
      flex-shrink: 0;
    }
  }
}
</style>
