const { app, BrowserWindow, ipcMain, screen } = require('electron')
const path = require('path')

const isDev = process.env.NODE_ENV === 'development'

app.name = 'WorkTrack Pro Admin'

/** @type {BrowserWindow | null} */
let mainWindow = null

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  mainWindow = new BrowserWindow({
    width: Math.min(1440, width),
    height: Math.min(900, height),
    minWidth: 1024,
    minHeight: 700,
    title: 'WorkTrack Pro — Admin Console',
    backgroundColor: '#0a0a14',
    webPreferences: {
      // Security: context isolation ON, Node integration OFF
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
      // Disable remote module
      enableRemoteModule: false,
    },
    // Frameless-style titlebar for macOS only
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
  })

  // Load Vite dev server or built files
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173').catch(err => {
      console.warn('[Admin Main] Could not connect to dev server, falling back to dist:', err)
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
    })
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Show window once ready to avoid flash, with fallback
  mainWindow.once('ready-to-show', () => {
    if (mainWindow) mainWindow.show()
  })

  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show()
    }
  }, 1000)

  mainWindow.webContents.on('did-fail-load', (e, code, desc) => {
    console.error('[Admin Main] did-fail-load:', code, desc)
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show()
    }
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
// All IPC messages are validated before processing.
// Phase 1: Returns mock responses. Replace with Firebase calls in Phase 2.

ipcMain.handle('settings:get', async (_event) => {
  // TODO Phase 2: Fetch from Firebase
  return {
    success: true,
    data: {
      screenshotIntervalSeconds: 120,
      screenshotQuality: 'medium',
      dataRetentionDays: 30,
      enableLiveScreenView: true,
      requireEmployeeApprovalForLiveView: true,
    },
  }
})

ipcMain.handle('settings:update', async (_event, payload) => {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'Invalid payload' }
  }
  // TODO Phase 2: Persist to Firebase
  console.log('[Admin Main] Settings update requested:', payload)
  return { success: true, data: payload }
})

ipcMain.handle('share:request', async (_event, payload) => {
  if (!payload?.employeeId || !payload?.deviceId) {
    return { success: false, error: 'Missing employeeId or deviceId' }
  }
  // TODO Phase 2: Send real request via Firebase to employee device
  console.log('[Admin Main] Screen view request:', payload)
  return {
    success: true,
    data: { requestId: `req_${Date.now()}`, status: 'pending' },
  }
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
