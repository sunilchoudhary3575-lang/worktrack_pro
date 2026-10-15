const { app, BrowserWindow, ipcMain, desktopCapturer, screen } = require('electron')
const path = require('path')

const isDev = process.env.NODE_ENV === 'development'

/** @type {BrowserWindow | null} */
let mainWindow = null

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  mainWindow = new BrowserWindow({
    width: 480,
    height: 720,
    minWidth: 400,
    minHeight: 600,
    maxWidth: 600,
    title: 'WorkTrack Pro',
    backgroundColor: '#080f0e',
    resizable: true,
    webPreferences: {
      // Security: context isolation ON, Node integration OFF
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
      enableRemoteModule: false,
    },
    titleBarStyle: 'hiddenInset',
    show: false,
    // Center on screen
    x: Math.floor((width - 480) / 2),
    y: Math.floor((height - 720) / 2),
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5174')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── IPC Handlers ────────────────────────────────────────────

ipcMain.handle('device:register', async (_event, payload) => {
  if (!payload?.deviceName || !payload?.employeeId) {
    return { success: false, error: 'Missing deviceName or employeeId' }
  }
  // TODO Phase 2: Register device in Firebase
  console.log('[Employee Main] Device registration:', payload)
  return {
    success: true,
    data: {
      deviceId: `dev_${Date.now()}`,
      deviceName: payload.deviceName,
      employeeId: payload.employeeId,
    },
  }
})

ipcMain.handle('session:start', async (_event, payload) => {
  if (!payload?.deviceId) return { success: false, error: 'Missing deviceId' }
  // TODO Phase 2: Create session in Firebase
  return {
    success: true,
    data: { sessionId: `sess_${Date.now()}`, startedAt: new Date().toISOString() },
  }
})

ipcMain.handle('session:end', async (_event, payload) => {
  if (!payload?.sessionId) return { success: false, error: 'Missing sessionId' }
  // TODO Phase 2: Update session in Firebase
  return { success: true }
})

ipcMain.handle('capture:sources', async (_event) => {
  // Get available screen sources using Electron's desktopCapturer
  // This is the correct Electron API for screen capture.
  // The renderer uses getUserMedia with these source IDs.
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 240 },
    })
    return {
      success: true,
      data: sources.map(s => ({
        id: s.id,
        name: s.name,
        thumbnail: s.thumbnail.toDataURL(),
      })),
    }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('share:approve', async (_event, payload) => {
  if (!payload?.requestId) return { success: false, error: 'Missing requestId' }
  // TODO Phase 2: Signal approval to admin via Firebase
  console.log('[Employee Main] Screen share approved by employee:', payload.requestId)
  return { success: true }
})

ipcMain.handle('share:deny', async (_event, payload) => {
  if (!payload?.requestId) return { success: false, error: 'Missing requestId' }
  // TODO Phase 2: Signal denial to admin via Firebase
  console.log('[Employee Main] Screen share denied by employee:', payload.requestId)
  return { success: true }
})

ipcMain.handle('share:stop', async (_event) => {
  // TODO Phase 2: Stop WebRTC stream and notify admin
  return { success: true }
})

ipcMain.handle('window:minimize', async () => {
  if (mainWindow) mainWindow.minimize()
  return { success: true }
})

ipcMain.handle('window:maximize', async () => {
  if (!mainWindow) return { success: false }
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow.maximize()
  }
  return { success: true, isMaximized: mainWindow.isMaximized() }
})

ipcMain.handle('window:close', async () => {
  if (mainWindow) mainWindow.close()
  return { success: true }
})

ipcMain.handle('window:isMaximized', async () => {
  return { success: true, isMaximized: mainWindow ? mainWindow.isMaximized() : false }
})

