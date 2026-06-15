// 节点图片大小调整插件（兼容壳）
// 缩放逻辑已迁移至 NodeImgSelect 统一管理。
// 保留此插件以避免已有注册代码报错。

class NodeImgAdjust {
  constructor() {}
  beforePluginRemove() {}
  beforePluginDestroy() {}
}

NodeImgAdjust.instanceName = 'nodeImgAdjust'

export default NodeImgAdjust
