const { contextBridge, ipcRenderer } = require('electron')

const ALLOWED_CHANNELS = [
  'device:getInfo',
  'device:register',
  'device:getRegistration',
  'device:saveRegistration',
  'device:clearRegistration',
  'session:start',
  'session:end',
  'session:getActive',
  'session:saveActive',
  'session:clearActive',
  'session:getHistory',
  'session:saveHistory',
  'capture:sources',
  'capture:takeScreenshot',
  'capture:getRecent',
  'capture:delete',
  'capture:readImage',
  'monitoring:setAuthorization',
  'monitoring:getAuthorization',
  'share:approve',
  'share:deny',
  'share:stop',
  'window:minimize',
  'window:maximize',
  'window:close',
  'window:isMaximized',
  'settings:getBackgroundSettings',
  'settings:setBackgroundSettings',
  'onboarding:getRecord',
  'onboarding:saveRecord',
  'schedule:getStatus',
  'schedule:evaluate',
  'schedule:recordManualStop',
  'schedule:recordManualStart',
  'tray:updateStatus',
  'session:scheduleUpdated',
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

  // Phase 7: Narrow, validated screenshot capture API
  capture: {
    takeScreenshot: async (payload) => {
      return ipcRenderer.invoke('capture:takeScreenshot', payload)
    },
    getRecent: async (limit) => {
      return ipcRenderer.invoke('capture:getRecent', { limit })
    },
    delete: async (filename) => {
      return ipcRenderer.invoke('capture:delete', { filename })
    },
    readImage: async (filename) => {
      return ipcRenderer.invoke('capture:readImage', { filename })
    },
  },

  // Monitoring authorization persistence sync
  monitoring: {
    setAuthorization: async (record) => {
      return ipcRenderer.invoke('monitoring:setAuthorization', record)
    },
    getAuthorization: async () => {
      return ipcRenderer.invoke('monitoring:getAuthorization')
    },
  },

  // Phase 8: Schedule and Background settings
  schedule: {
    getStatus: async () => {
      return ipcRenderer.invoke('schedule:getStatus')
    },
    evaluate: async () => {
      return ipcRenderer.invoke('schedule:evaluate')
    },
    recordManualStop: async () => {
      return ipcRenderer.invoke('schedule:recordManualStop')
    },
    recordManualStart: async () => {
      return ipcRenderer.invoke('schedule:recordManualStart')
    },
  },

  settings: {
    getBackgroundSettings: async () => {
      return ipcRenderer.invoke('settings:getBackgroundSettings')
    },
    setBackgroundSettings: async (settings) => {
      return ipcRenderer.invoke('settings:setBackgroundSettings', settings)
    },
  },

  onboarding: {
    getRecord: async (deviceId) => {
      return ipcRenderer.invoke('onboarding:getRecord', { deviceId })
    },
    saveRecord: async (record) => {
      return ipcRenderer.invoke('onboarding:saveRecord', record)
    },
  },

  platform: process.platform,
})

