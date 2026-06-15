class Ai {
  constructor(options = {}) {
    this.options = options

    this.baseData = {}
    this.controller = null
    this.currentChunk = ''
    this.content = ''
  }

  init(type = 'huoshan', options = {}) {
    // 火山引擎接口
    if (type === 'huoshan') {
      this.baseData = {
        api: options.api,
        method: options.method,
        transport: options.transport || 'direct',
        headers: {
          Authorization: 'Bearer ' + options.key
        },
        data: {
          model: options.model,
          stream: true
        }
      }
    }
  }

  async request(data, progress = () => {}, end = () => {}, err = () => {}) {
    try {
      const res = await this.postMsg(data)
      const decoder = new TextDecoder()
      let ended = false
      while (!this.controller.signal.aborted) {
        const { done, value } = await res.read()
        if (done) {
          if (!ended && this.content) {
            ended = true
            end(this.content)
          }
          return
        }
        // 拿到当前切片的数据
        const text = decoder.decode(value)
        // 处理切片数据
        let chunk = this.handleChunkData(text)
        // 判断是否有不完整切片，如果有，合并下一次处理，没有则获取数据
        if (this.currentChunk) continue
        let isEnd = false
        const list = chunk
          .split('\n')
          .filter(item => {
            isEnd = item.includes('[DONE]')
            return !!item && !isEnd
          })
          .map(item => {
            return JSON.parse(item.replace(/^data:/, ''))
          })
        list.forEach(item => {
          this.content += item.choices
            .map(item2 => {
              return item2.delta.content
            })
            .join('')
        })
        progress(this.content)
        if (isEnd) {
          ended = true
          end(this.content)
        }
      }
    } catch (error) {
      console.log(error)
      // 手动停止请求不需要触发错误回调
      if (!(error && error.name === 'AbortError')) {
        err(error)
      }
    }
  }

  async postMsg(data) {
    this.controller = new AbortController()
    const endpoint = String(this.baseData.api || '').replace(/\/$/, '')
    const isHostProxy = this.baseData.transport === 'host-proxy'
    const res = await fetch(endpoint, {
      signal: this.controller.signal,
      method: this.baseData.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(isHostProxy ? {} : this.baseData.headers)
      },
      body: JSON.stringify(
        isHostProxy
          ? data
          : {
              ...this.baseData.data,
              ...data
            }
      )
    })
    if (res.status && res.status !== 200) {
      throw new Error(await this.getResponseErrorMessage(res))
    }
    return res.body.getReader()
  }

  async getResponseErrorMessage(res) {
    try {
      const text = await res.text()
      if (!text) {
        return `请求失败（HTTP ${res.status}）`
      }
      try {
        const json = JSON.parse(text)
        return json.message || json.error || `请求失败（HTTP ${res.status}）`
      } catch (error) {
        return text || `请求失败（HTTP ${res.status}）`
      }
    } catch (error) {
      return `请求失败（HTTP ${res.status}）`
    }
  }

  handleChunkData(chunk) {
    chunk = chunk.trim()
    // 如果存在上一个切片
    if (this.currentChunk) {
      chunk = this.currentChunk + chunk
      this.currentChunk = ''
    }
    // 如果存在done,认为是完整切片且是最后一个切片
    if (chunk.includes('[DONE]')) {
      return chunk
    }
    // 最后一个字符串不为}，则默认切片不完整，保存与下次拼接使用（这种方法不严谨，但已经能解决大部分场景的问题）
    if (chunk[chunk.length - 1] !== '}') {
      this.currentChunk = chunk
    }
    return chunk
  }

  stop() {
    this.controller.abort()
    this.controller = new AbortController()
  }
}

export default Ai
