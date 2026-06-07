//  导出XMind插件，需要通过Export插件使用
class ExportXMind {
  //  构造函数
  constructor(opt) {
    this.mindMap = opt.mindMap
  }

  // 导出xmind
  async xmind(data, name) {
    const { default: xmind } = await import('../parse/xmind')
    const zipData = await xmind.transformToXmind(data, name)
    return zipData
  }

  // 获取解析器
  async getXmind() {
    const { default: xmind } = await import('../parse/xmind')
    return xmind
  }
}

ExportXMind.instanceName = 'doExportXMind'

export default ExportXMind
