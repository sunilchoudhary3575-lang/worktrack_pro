const { contextBridge, ipcRenderer } = require('electron')

const ALLOWED_CHANNELS = [
  'device:register',
  'session:start',
  'session:end',
  'capture:sources',
  'share:approve',
  'share:deny',
  'share:stop',
  'window:minimize',
  'window:maximize',
  'window:close',
  'window:isMaximized',
]

function assertChannel(channel) {
  if (!ALLOWED_CHANNELS.includes(channel)) {
    throw new Error(`IPC channel "${channel}" is not permitted in the renderer`)
  }
}

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: async (channel, payload) => {
    assertChannel(channel)
    return ipcRenderer.invoke(channel, payload)
  },

  on: (channel, callback) => {
    assertChannel(channel)
    const handler = (_event, data) => callback(data)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },

  platform: process.platform,
})
