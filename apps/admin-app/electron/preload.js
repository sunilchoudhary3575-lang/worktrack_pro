const { contextBridge, ipcRenderer } = require('electron')

// ─── Secure IPC Bridge ────────────────────────────────────────
// Exposes a minimal, validated API to the renderer process.
// The renderer CANNOT access Node.js or Electron internals directly.

const ALLOWED_CHANNELS = [
  'settings:get',
  'settings:update',
  'share:request',
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
    throw new Error(`IPC channel "${channel}" is not allowed`)
  }
}

contextBridge.exposeInMainWorld('electronAPI', {
  /** Send an IPC request and await response */
  invoke: async (channel, payload) => {
    assertChannel(channel)
    return ipcRenderer.invoke(channel, payload)
  },

  /** Subscribe to a push event from main process */
  on: (channel, callback) => {
    assertChannel(channel)
    const handler = (_event, data) => callback(data)
    ipcRenderer.on(channel, handler)
    // Return unsubscribe function
    return () => ipcRenderer.removeListener(channel, handler)
  },

  /** Platform info */
  platform: process.platform,
})
