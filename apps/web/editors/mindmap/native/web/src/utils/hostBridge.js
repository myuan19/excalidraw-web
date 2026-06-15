const HOST_SOURCE = 'excalidraw-web'
const NATIVE_SOURCE = 'simple-mind-map-native'

const getHostTargetOrigin = () => {
  try {
    if (document.referrer) {
      return new URL(document.referrer).origin
    }
  } catch (error) {
    // fall through
  }
  return window.location.origin
}

export const HOST_COMMANDS = {
  backToFiles: 'hostBackToFiles',
  requestSave: 'hostRequestSave',
  openEmbedManager: 'hostOpenEmbedManager',
  openAISettings: 'hostOpenAISettings',
  openHistory: 'hostOpenHistory'
}

export const isHostMode = () => {
  return window.takeOverApp === true && window.parent && window.parent !== window
}

export const postHostCommand = (type, payload) => {
  if (!isHostMode()) {
    return
  }
  window.parent.postMessage(
    {
      source: NATIVE_SOURCE,
      type,
      payload
    },
    getHostTargetOrigin()
  )
}

export const backToFiles = () => postHostCommand(HOST_COMMANDS.backToFiles)
export const requestSave = () => postHostCommand(HOST_COMMANDS.requestSave)
export const openEmbedManager = () => postHostCommand(HOST_COMMANDS.openEmbedManager)
export const openAISettings = () => postHostCommand(HOST_COMMANDS.openAISettings)
export const openHistory = () => postHostCommand(HOST_COMMANDS.openHistory)

export const isHostMessage = message => {
  return !!message && message.source === HOST_SOURCE
}
