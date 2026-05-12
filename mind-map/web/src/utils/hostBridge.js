const HOST_SOURCE = 'excalidraw-web'
const NATIVE_SOURCE = 'simple-mind-map-native'

export const HOST_COMMANDS = {
  backToFiles: 'hostBackToFiles',
  requestSave: 'hostRequestSave',
  openHistory: 'hostOpenHistory',
  openAISettings: 'hostOpenAISettings'
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
    window.location.origin
  )
}

export const backToFiles = () => postHostCommand(HOST_COMMANDS.backToFiles)
export const requestSave = () => postHostCommand(HOST_COMMANDS.requestSave)
export const openHistory = () => postHostCommand(HOST_COMMANDS.openHistory)
export const openAISettings = () => postHostCommand(HOST_COMMANDS.openAISettings)

export const isHostMessage = message => {
  return !!message && message.source === HOST_SOURCE
}
