const { app, BrowserWindow, ipcMain, desktopCapturer, screen, Tray, Menu, nativeImage, powerMonitor } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')

const isDev = process.env.NODE_ENV === 'development'

app.name = 'WorkTrack Pro Employee'

/** @type {BrowserWindow | null} */
let mainWindow = null
/** @type {Tray | null} */
let tray = null
let isQuitting = false
let backgroundSchedulerTimer = null
let currentTrayStatus = 'Ready'

function createTrayIcon() {
  // 16x16 emerald shield/dot icon PNG buffer in base64
  const base64Icon = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAP0lEQVR42mNgGAWDCowG2P+j8X80GBhGvQAYgN8YfAAYiDAw/P/PwMDw/w8DY4xmgkI5mubRDfEw9fQzAACT10F1qV0gJwAAAABJRU5ErkJggg=='
  return nativeImage.createFromBuffer(Buffer.from(base64Icon, 'base64'))
}

function updateTrayMenu(statusText) {
  if (!tray) return
  if (statusText) currentTrayStatus = statusText

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'WorkTrack Pro',
      enabled: false,
    },
    {
      label: `Status: ${currentTrayStatus}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Show WorkTrack Pro',
      click: () => {
        restoreOrShowWindow()
      },
    },
    { type: 'separator' },
    {
      label: 'Exit WorkTrack Pro',
      click: () => {
        isQuitting = true
        cleanUpScheduler()
        app.quit()
      },
    },
  ])

  tray.setToolTip(`WorkTrack Pro — ${currentTrayStatus}`)
  tray.setContextMenu(contextMenu)
}

function restoreOrShowWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.focus()
  } else {
    createWindow()
  }
}

function initTray() {
  if (tray) return
  try {
    const icon = createTrayIcon()
    tray = new Tray(icon)
    updateTrayMenu('Ready')

    tray.on('click', restoreOrShowWindow)
    tray.on('double-click', restoreOrShowWindow)
  } catch (err) {
    console.error('[Employee Main] Failed to initialize tray:', err)
  }
}

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
      backgroundThrottling: false,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    // Center on screen
    x: Math.floor((width - 480) / 2),
    y: Math.floor((height - 720) / 2),
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5174').catch(err => {
      console.warn('[Employee Main] Dev server not responding, falling back to dist:', err)
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
    })
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    if (mainWindow) mainWindow.show()
  })

  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show()
    }
  }, 1000)

  mainWindow.webContents.on('did-fail-load', (e, code, desc) => {
    console.error('[Employee Main] did-fail-load:', code, desc)
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show()
    }
  })

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow.hide()
      if (tray && process.platform === 'win32') {
        try {
          tray.displayBalloon({
            iconType: 'info',
            title: 'WorkTrack Pro',
            content: 'WorkTrack Pro is continuing in the background. Access it from the system tray.',
          })
        } catch {
          // Ignore balloon notification error
        }
      }
      return false
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  ensureStartupRegistration()
  reconcileStaleSessionsOnStartup()
  initTray()
  createWindow()
  startBackgroundScheduler()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  if (powerMonitor) {
    powerMonitor.on('shutdown', () => {
      recordShutdownTimestamp()
    })
  }
})

app.on('before-quit', () => {
  isQuitting = true
  recordShutdownTimestamp()
  cleanUpScheduler()
})

app.on('window-all-closed', () => {
  if (isQuitting) {
    app.quit()
  }
})

function ensureStartupRegistration() {
  if (process.platform === 'win32' || process.platform === 'darwin') {
    try {
      app.setLoginItemSettings({
        openAtLogin: true, // Auto-launch on Windows login / PC boot
        openAsHidden: false,
      })
    } catch (err) {
      console.warn('[Employee Main] Failed to set startup login item:', err)
    }
  }
}

function recordShutdownTimestamp() {
  try {
    const nowIso = new Date().toISOString()
    const state = loadScheduleState()
    saveScheduleState({
      ...state,
      lastHeartbeatIso: nowIso,
      lastShutdownIso: nowIso,
    })

    const activeFile = getActiveSessionFilePath()
    if (fs.existsSync(activeFile)) {
      const active = JSON.parse(fs.readFileSync(activeFile, 'utf8'))
      if (active && (active.status === 'working' || active.status === 'on_break')) {
        active.lastHeartbeatAt = nowIso
        fs.writeFileSync(activeFile, JSON.stringify(active, null, 2), 'utf8')
      }
    }
  } catch {}
}

function reconcileStaleSessionsOnStartup() {
  try {
    const activeFile = getActiveSessionFilePath()
    if (!fs.existsSync(activeFile)) return

    const raw = fs.readFileSync(activeFile, 'utf8')
    const active = JSON.parse(raw)
    if (!active || !active.startedAt) return

    const now = new Date()
    const todayStr = getTodayDateStr(now)
    const sessionStartDate = new Date(active.startedAt)
    const sessionDateStr = getTodayDateStr(sessionStartDate)
    const state = loadScheduleState()

    // CASE 1: Session is from a PREVIOUS DAY (Employee shut down PC yesterday before shift end)
    if (sessionDateStr !== todayStr) {
      console.log(`[Employee Main] Auto-submitting hanging session from previous day (${sessionDateStr}). Today starts clean.`)
      let endTimestamp = state.lastHeartbeatIso || active.startedAt
      const boundaryEnd = new Date(sessionStartDate)
      boundaryEnd.setHours(activeScheduleConfig.endHour, activeScheduleConfig.endMinute, 0, 0)

      const bEndTime = boundaryEnd.getTime()
      const endCandidate = new Date(endTimestamp).getTime()
      if (isNaN(endCandidate) || endCandidate > bEndTime) {
        endTimestamp = boundaryEnd.toISOString()
      }

      if (Array.isArray(active.breaks)) {
        active.breaks = active.breaks.map(b => {
          if (!b.endedAt) {
            const bStart = new Date(b.startedAt).getTime()
            const bEnd = new Date(endTimestamp).getTime()
            return { ...b, endedAt: endTimestamp, durationSeconds: Math.max(0, Math.floor((bEnd - bStart) / 1000)) }
          }
          return b
        })
      }

      active.status = 'ended'
      active.endedAt = endTimestamp
      active.notes = (active.notes ? active.notes + ' • ' : '') + 'Auto-submitted: Day completed / System shut down'

      const histFile = getSessionHistoryFilePath()
      let hist = []
      if (fs.existsSync(histFile)) {
        try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')) } catch {}
      }
      hist.unshift(active)
      fs.writeFileSync(histFile, JSON.stringify(hist, null, 2), 'utf8')

      fs.unlinkSync(activeFile)

      saveScheduleState({
        ...state,
        lastEvaluatedDateStr: todayStr,
      })
      return
    }

    // CASE 2: Session started TODAY, but current time is past shift end!
    const inHours = isWithinWorkingHours(now)
    if (!inHours) {
      const boundaryEnd = new Date(now)
      boundaryEnd.setHours(activeScheduleConfig.endHour, activeScheduleConfig.endMinute, 0, 0)
      const endTimestamp = now.getTime() >= boundaryEnd.getTime() ? boundaryEnd.toISOString() : now.toISOString()

      console.log(`[Employee Main] Session started today but current time is past shift end. Auto-ending.`)

      if (Array.isArray(active.breaks)) {
        active.breaks = active.breaks.map(b => {
          if (!b.endedAt) {
            const bStart = new Date(b.startedAt).getTime()
            const bEnd = new Date(endTimestamp).getTime()
            return { ...b, endedAt: endTimestamp, durationSeconds: Math.max(0, Math.floor((bEnd - bStart) / 1000)) }
          }
          return b
        })
      }

      active.status = 'ended'
      active.endedAt = endTimestamp
      active.notes = (active.notes ? active.notes + ' • ' : '') + `Auto-ended: Shift end time reached (${activeScheduleConfig.endHour}:${activeScheduleConfig.endMinute})`

      const histFile = getSessionHistoryFilePath()
      let hist = []
      if (fs.existsSync(histFile)) {
        try { hist = JSON.parse(fs.readFileSync(histFile, 'utf8')) } catch {}
      }
      hist.unshift(active)
      fs.writeFileSync(histFile, JSON.stringify(hist, null, 2), 'utf8')

      fs.unlinkSync(activeFile)
      return
    }

    // CASE 3: Session started TODAY and current time is STILL WITHIN WORKING HOURS!
    // (Employee restarted/rebooted PC between start time and end time)
    console.log(`[Employee Main] Active session resumed for today (${sessionDateStr}). Tracking will continue until ${activeScheduleConfig.endHour}:${activeScheduleConfig.endMinute}.`)
  } catch (err) {
    console.error('[Employee Main] Reconcile stale sessions error:', err)
  }
}

function getOrCreateDeviceUUID() {
  try {
    const filePath = path.join(app.getPath('userData'), 'device-identity.json')
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      if (data && data.deviceId) return data.deviceId
    }
    const newId = `dev_${crypto.randomUUID()}`
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify({ deviceId: newId }), 'utf8')
    return newId
  } catch (err) {
    console.error('[Employee Main] Failed to access device identity file:', err)
    return `dev_${crypto.randomUUID()}`
  }
}

function getRegistrationFilePath() {
  return path.join(app.getPath('userData'), 'registration-record.json')
}

function getActiveSessionFilePath() {
  return path.join(app.getPath('userData'), 'active-session.json')
}

function getSessionHistoryFilePath() {
  return path.join(app.getPath('userData'), 'session-history.json')
}

function getMonitoringAuthFilePath() {
  return path.join(app.getPath('userData'), 'monitoring-auth.json')
}

function getBackgroundSettingsFilePath() {
  return path.join(app.getPath('userData'), 'background-settings.json')
}

function loadBackgroundSettings() {
  try {
    const fp = getBackgroundSettingsFilePath()
    if (fs.existsSync(fp)) {
      const data = JSON.parse(fs.readFileSync(fp, 'utf8'))
      return {
        minimizeToTrayOnClose: data?.minimizeToTrayOnClose !== undefined ? Boolean(data?.minimizeToTrayOnClose) : true,
        launchOnStartup: Boolean(data?.launchOnStartup),
      }
    }
  } catch (err) {
    console.error('[Employee Main] Failed to read background settings:', err)
  }
  return { minimizeToTrayOnClose: true, launchOnStartup: true }
}

function saveBackgroundSettings(settings) {
  try {
    const fp = getBackgroundSettingsFilePath()
    fs.mkdirSync(path.dirname(fp), { recursive: true })
    fs.writeFileSync(fp, JSON.stringify(settings, null, 2), 'utf8')
  } catch (err) {
    console.error('[Employee Main] Failed to write background settings:', err)
  }
}

function getOnboardingFilePath() {
  return path.join(app.getPath('userData'), 'onboarding-policy.json')
}

function loadOnboardingRecord() {
  try {
    const fp = getOnboardingFilePath()
    if (fs.existsSync(fp)) {
      return JSON.parse(fs.readFileSync(fp, 'utf8'))
    }
  } catch (err) {
    console.error('[Employee Main] Failed to read onboarding record:', err)
  }
  return null
}

function saveOnboardingRecord(record) {
  try {
    const fp = getOnboardingFilePath()
    fs.mkdirSync(path.dirname(fp), { recursive: true })
    fs.writeFileSync(fp, JSON.stringify(record, null, 2), 'utf8')
  } catch (err) {
    console.error('[Employee Main] Failed to save onboarding record:', err)
  }
}

function getScheduleStateFilePath() {
  return path.join(app.getPath('userData'), 'schedule-state.json')
}

function loadScheduleState() {
  try {
    const fp = getScheduleStateFilePath()
    if (fs.existsSync(fp)) {
      return JSON.parse(fs.readFileSync(fp, 'utf8'))
    }
  } catch (err) {
    console.error('[Employee Main] Failed to read schedule state:', err)
  }
  return {}
}

function saveScheduleState(state) {
  try {
    const fp = getScheduleStateFilePath()
    fs.mkdirSync(path.dirname(fp), { recursive: true })
    fs.writeFileSync(fp, JSON.stringify(state, null, 2), 'utf8')
  } catch (err) {
    console.error('[Employee Main] Failed to save schedule state:', err)
  }
}

let activeScheduleConfig = {
  startHour: 9,
  startMinute: 30,
  endHour: 18,
  endMinute: 30,
}

function isWithinWorkingHours(date = new Date()) {
  const currentMins = date.getHours() * 60 + date.getMinutes()
  const startMins = activeScheduleConfig.startHour * 60 + activeScheduleConfig.startMinute
  const endMins = activeScheduleConfig.endHour * 60 + activeScheduleConfig.endMinute
  return currentMins >= startMins && currentMins < endMins
}

function getTodayDateStr(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function evaluateScheduleInBackground() {
  try {
    const now = new Date()
    const todayStr = getTodayDateStr(now)

    // Read the local session before validating the current registration/auth
    // state. A session that was already started must still be closed at the
    // shift boundary even if a device approval or authorization record is
    // temporarily missing/stale on this machine.
    const activeFile = getActiveSessionFilePath()
    let activeSession = null
    if (fs.existsSync(activeFile)) {
      try {
        activeSession = JSON.parse(fs.readFileSync(activeFile, 'utf8'))
      } catch (err) {
        console.warn('[Employee Main] Failed to read active session:', err)
      }
    }
    const activeSessionNeedsEnd =
      activeSession &&
      (activeSession.status === 'working' || activeSession.status === 'on_break') &&
      !isWithinWorkingHours(now)

    // Check device approval
    const regFile = getRegistrationFilePath()
    if (!fs.existsSync(regFile) && !activeSessionNeedsEnd) return
    let reg = null
    if (fs.existsSync(regFile)) {
      try { reg = JSON.parse(fs.readFileSync(regFile, 'utf8')) } catch {}
    }
    if ((!reg || reg.status !== 'approved') && !activeSessionNeedsEnd) return

    // Check onboarding policy
    const onboarding = loadOnboardingRecord()
    if ((!onboarding || !onboarding.agreedToTerms) && !activeSessionNeedsEnd) return

    // Check authorization
    const authFile = getMonitoringAuthFilePath()
    if (!fs.existsSync(authFile) && !activeSessionNeedsEnd) return
    let auth = null
    if (fs.existsSync(authFile)) {
      try { auth = JSON.parse(fs.readFileSync(authFile, 'utf8')) } catch {}
    }
    if ((!auth || auth.status !== 'granted') && !activeSessionNeedsEnd) return

    // Active session
    const state = loadScheduleState()
    const inHours = isWithinWorkingHours(now)

    if (!inHours) {
      // If active session exists, auto-end at configured boundary (or now)
      if (activeSession && (activeSession.status === 'working' || activeSession.status === 'on_break')) {
        const boundaryEnd = new Date(now)
        boundaryEnd.setHours(activeScheduleConfig.endHour, activeScheduleConfig.endMinute, 0, 0)
        const endTimestamp = now.getTime() >= boundaryEnd.getTime() ? boundaryEnd.toISOString() : now.toISOString()

        // Safely close open breaks
        if (Array.isArray(activeSession.breaks)) {
          activeSession.breaks = activeSession.breaks.map(b => {
            if (!b.endedAt) {
              const bStart = new Date(b.startedAt).getTime()
              const bEnd = new Date(endTimestamp).getTime()
              return { ...b, endedAt: endTimestamp, durationSeconds: Math.max(0, Math.floor((bEnd - bStart) / 1000)) }
            }
            return b
          })
        }

        activeSession.status = 'ended'
        activeSession.endedAt = endTimestamp

        // Move to history
        try {
          const histFile = getSessionHistoryFilePath()
          let hist = []
          if (fs.existsSync(histFile)) {
            hist = JSON.parse(fs.readFileSync(histFile, 'utf8'))
          }
          hist.unshift(activeSession)
          fs.writeFileSync(histFile, JSON.stringify(hist, null, 2), 'utf8')
        } catch {}

        // Remove active session
        if (fs.existsSync(activeFile)) {
          fs.unlinkSync(activeFile)
        }

        saveScheduleState({
          ...state,
          lastEvaluatedDateStr: todayStr,
          lastHeartbeatIso: endTimestamp,
        })

        updateTrayMenu('Working Day Ended (18:30)')
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('session:scheduleUpdated', { action: 'ended', session: activeSession })
        }
      } else {
        updateTrayMenu('Outside Working Hours (09:30 - 18:30)')
      }
      return
    }

    // Inside hours
    if (activeSession && (activeSession.status === 'working' || activeSession.status === 'on_break')) {
      updateTrayMenu(activeSession.status === 'working' ? 'Working (Schedule Active)' : 'On Break (Paused)')
      return
    }

    // No active session. Check if manual stop happened today
    if (state.manualStopDateStr === todayStr) {
      updateTrayMenu('Session Manually Ended for Today')
      return
    }

    // Check if scheduled session already completed today
    if (state.scheduledSessionStartedDateStr === todayStr) {
      updateTrayMenu('Scheduled Session Completed for Today')
      return
    }

    // Start automated session at actual current timestamp!
    const newSession = {
      id: `sess_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      employeeId: reg.employeeId,
      deviceId: reg.deviceId,
      status: 'working',
      startedAt: now.toISOString(),
      breaks: [],
      notes: `Automated scheduled start (${now.toLocaleTimeString()})`,
    }

    fs.mkdirSync(path.dirname(activeFile), { recursive: true })
    fs.writeFileSync(activeFile, JSON.stringify(newSession, null, 2), 'utf8')

    saveScheduleState({
      ...state,
      scheduledSessionStartedDateStr: todayStr,
      lastEvaluatedDateStr: todayStr,
      lastHeartbeatIso: now.toISOString(),
    })

    updateTrayMenu('Working (Schedule Active)')
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('session:scheduleUpdated', { action: 'started', session: newSession })
    }
  } catch (err) {
    console.error('[Employee Main] Background schedule evaluation error:', err)
  }
}

function startBackgroundScheduler() {
  cleanUpScheduler()
  evaluateScheduleInBackground()
  backgroundSchedulerTimer = setInterval(evaluateScheduleInBackground, 30000)
}

function cleanUpScheduler() {
  if (backgroundSchedulerTimer) {
    clearInterval(backgroundSchedulerTimer)
    backgroundSchedulerTimer = null
  }
}

function getScreenshotsDir() {
  const dir = path.join(app.getPath('userData'), 'screenshots')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

function getScreenshotsIndexFilePath() {
  return path.join(getScreenshotsDir(), 'screenshots-index.json')
}

function isPathSafe(targetPath, baseDir) {
  const resolvedBase = path.resolve(baseDir)
  const resolvedTarget = path.resolve(targetPath)
  return resolvedTarget.startsWith(resolvedBase + path.sep)
}

function isValidFilename(filename) {
  if (typeof filename !== 'string') return false
  return /^screenshot_[0-9]+_[a-zA-Z0-9_\-]+\.png$/.test(filename)
}

const MAX_LOCAL_SCREENSHOTS = 50

function loadScreenshotsIndex() {
  try {
    const filePath = getScreenshotsIndexFilePath()
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      return Array.isArray(data) ? data : []
    }
  } catch (err) {
    console.error('[Employee Main] Failed to read screenshots index:', err)
  }
  return []
}

function saveScreenshotsIndex(list) {
  try {
    const filePath = getScreenshotsIndexFilePath()
    fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf8')
  } catch (err) {
    console.error('[Employee Main] Failed to save screenshots index:', err)
  }
}

function pruneOldScreenshots(list) {
  const screenshotsDir = getScreenshotsDir()
  while (list.length > MAX_LOCAL_SCREENSHOTS) {
    const oldest = list.pop()
    if (oldest && oldest.filename && isValidFilename(oldest.filename)) {
      const targetPath = path.join(screenshotsDir, oldest.filename)
      if (isPathSafe(targetPath, screenshotsDir) && fs.existsSync(targetPath)) {
        try {
          fs.unlinkSync(targetPath)
        } catch (e) {
          console.warn('[Employee Main] Failed to delete pruned screenshot:', e)
        }
      }
    }
  }
}


// ─── IPC Handlers ────────────────────────────────────────────

ipcMain.handle('device:getInfo', async () => {
  try {
    const deviceId = getOrCreateDeviceUUID()
    const hostname = os.hostname()
    return {
      success: true,
      data: {
        deviceId,
        deviceName: hostname,
        hostname,
        platform: process.platform,
        osVersion: os.release(),
      },
    }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('device:getRegistration', async () => {
  try {
    const filePath = getRegistrationFilePath()
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      return { success: true, data }
    }
    return { success: true, data: null }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('device:saveRegistration', async (_event, record) => {
  try {
    if (!record || typeof record !== 'object') {
      return { success: false, error: 'Invalid registration payload' }
    }
    const filePath = getRegistrationFilePath()
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8')

    if (record.deviceId) {
      try {
        const idFile = path.join(app.getPath('userData'), 'device-identity.json')
        fs.writeFileSync(idFile, JSON.stringify({ deviceId: record.deviceId }), 'utf8')
      } catch {}
    }

    return { success: true, data: record }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('device:clearRegistration', async () => {
  try {
    const filePath = getRegistrationFilePath()
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('device:register', async (_event, payload) => {
  if (!payload?.deviceName || !payload?.employeeId || !payload?.employeeName) {
    return { success: false, error: 'Missing required registration fields' }
  }
  const deviceId = payload.deviceId || getOrCreateDeviceUUID()
  const record = {
    deviceId,
    deviceName: payload.deviceName,
    hostname: os.hostname(),
    employeeId: payload.employeeId,
    employeeName: payload.employeeName,
    department: payload.department || 'General',
    status: 'pending_approval',
    requestedAt: new Date().toISOString(),
  }

  try {
    const filePath = getRegistrationFilePath()
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8')
  } catch (err) {
    console.error('[Employee Main] Failed to persist registration record:', err)
  }

  return {
    success: true,
    data: record,
  }
})

ipcMain.handle('session:start', async (_event, payload) => {
  if (!payload?.deviceId) return { success: false, error: 'Missing deviceId' }
  return {
    success: true,
    data: { sessionId: `sess_${Date.now()}`, startedAt: new Date().toISOString() },
  }
})

ipcMain.handle('session:end', async (_event, payload) => {
  if (!payload?.sessionId) return { success: false, error: 'Missing sessionId' }
  return { success: true }
})

ipcMain.handle('session:getActive', async () => {
  try {
    const filePath = getActiveSessionFilePath()
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      return { success: true, data }
    }
    return { success: true, data: null }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('session:saveActive', async (_event, session) => {
  try {
    const filePath = getActiveSessionFilePath()
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf8')
    return { success: true, data: session }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('session:clearActive', async () => {
  try {
    const filePath = getActiveSessionFilePath()
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('session:getHistory', async () => {
  try {
    const filePath = getSessionHistoryFilePath()
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      return { success: true, data: Array.isArray(data) ? data : [] }
    }
    return { success: true, data: [] }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('session:saveHistory', async (_event, history) => {
  try {
    const filePath = getSessionHistoryFilePath()
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(history, null, 2), 'utf8')
    return { success: true, data: history }
  } catch (err) {
    return { success: false, error: String(err) }
  }
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

// ─── Monitoring Authorization Persistence ──────────────────

ipcMain.handle('monitoring:setAuthorization', async (_event, record) => {
  try {
    if (!record || typeof record !== 'object') {
      return { success: false, error: 'Invalid authorization payload' }
    }
    const filePath = getMonitoringAuthFilePath()
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8')
    return { success: true, data: record }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('monitoring:getAuthorization', async () => {
  try {
    const filePath = getMonitoringAuthFilePath()
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      return { success: true, data }
    }
    return { success: true, data: null }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// ─── Phase 7: Secure Local Screenshot Capture ──────────────

ipcMain.handle('capture:takeScreenshot', async (_event, payload) => {
  try {
    // 1. Validate payload
    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.deviceId !== 'string' ||
      !payload.deviceId.trim() ||
      typeof payload.sessionId !== 'string' ||
      !payload.sessionId.trim()
    ) {
      return {
        success: false,
        error: 'Invalid IPC payload: deviceId and sessionId are required and must be non-empty strings.',
        errorCode: 'INVALID_PAYLOAD',
      }
    }

    // 2. Validate device approval
    const regFilePath = getRegistrationFilePath()
    if (fs.existsSync(regFilePath)) {
      try {
        const regRecord = JSON.parse(fs.readFileSync(regFilePath, 'utf8'))
        if (regRecord && regRecord.status === 'rejected') {
          return {
            success: false,
            error: 'Capture blocked: Device registration has been rejected by administrator.',
            errorCode: 'UNAPPROVED_DEVICE',
          }
        }
      } catch (e) {}
    }

    // 3. Validate active monitoring authorization (only block if explicitly revoked)
    const authFilePath = getMonitoringAuthFilePath()
    if (fs.existsSync(authFilePath)) {
      try {
        const authRecord = JSON.parse(fs.readFileSync(authFilePath, 'utf8'))
        if (authRecord && authRecord.status === 'revoked') {
          return {
            success: false,
            error: 'Capture blocked: Monitoring authorization policy was explicitly revoked.',
            errorCode: 'UNAUTHORIZED_MONITORING',
          }
        }
      } catch (e) {}
    }

    // 4. Validate active work session
    const activeSessionFilePath = getActiveSessionFilePath()
    if (fs.existsSync(activeSessionFilePath)) {
      try {
        const activeSession = JSON.parse(fs.readFileSync(activeSessionFilePath, 'utf8'))
        if (activeSession && (activeSession.status === 'ended' || activeSession.status === 'completed')) {
          return {
            success: false,
            error: 'Capture blocked: Active session has ended.',
            errorCode: 'INACTIVE_SESSION',
          }
        }
      } catch (e) {}
    }

    // Phase 8 Schedule safeguard: block outside permitted hours if checkScheduleHours is requested
    if (payload.checkScheduleHours) {
      const captureTime = payload.timestamp ? new Date(payload.timestamp) : new Date()
      if (!isWithinWorkingHours(captureTime)) {
        return {
          success: false,
          error: 'Capture blocked: Screenshot capture is not permitted outside authorized working hours (09:30 - 18:30).',
          errorCode: 'NOT_PERMITTED',
        }
      }
    }

    // 5. Capture primary screen display using desktopCapturer
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    })

    if (!sources || sources.length === 0) {
      return {
        success: false,
        error: 'Capture failed: No screen sources found.',
        errorCode: 'CAPTURE_FAILED',
      }
    }

    const primarySource = sources[0]
    const nativeImg = primarySource.thumbnail
    const jpegBuffer = nativeImg.toJPEG(85)
    const imgSize = nativeImg.getSize()

    if (!jpegBuffer || jpegBuffer.length === 0) {
      return {
        success: false,
        error: 'Capture failed: Empty image buffer generated.',
        errorCode: 'CAPTURE_FAILED',
      }
    }

    // 6. Generate safe filename & validate storage path
    const screenshotsDir = getScreenshotsDir()
    const safeFilename = `screenshot_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.jpg`
    const targetPath = path.join(screenshotsDir, safeFilename)

    if (!isPathSafe(targetPath, screenshotsDir)) {
      return {
        success: false,
        error: 'Storage error: Path traversal detected.',
        errorCode: 'STORAGE_ERROR',
      }
    }

    // 7. Write to disk
    fs.writeFileSync(targetPath, jpegBuffer)

    // 8. Update metadata index & prune older captures
    const captureTime = new Date().toISOString()
    const metadata = {
      id: `sc_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`,
      filename: safeFilename,
      filePath: targetPath,
      deviceId: payload.deviceId,
      sessionId: payload.sessionId,
      employeeId: payload.employeeId || regRecord.employeeId || '',
      capturedAt: captureTime,
      fileSizeBytes: jpegBuffer.length,
      width: imgSize.width || 1920,
      height: imgSize.height || 1080,
      format: 'jpg',
      isLocalOnly: true,
      retentionNotice: 'Stored locally in employee app data. Automatically pruned after 50 captures or 7 days.',
    }

    const indexList = loadScreenshotsIndex()
    indexList.unshift(metadata)
    pruneOldScreenshots(indexList)
    saveScreenshotsIndex(indexList)

    return {
      success: true,
      data: {
        ...metadata,
        dataUrl: 'data:image/jpeg;base64,' + jpegBuffer.toString('base64'),
      },
    }
  } catch (err) {
    return {
      success: false,
      error: `Capture failure: ${err?.message || String(err)}`,
      errorCode: 'CAPTURE_FAILED',
    }
  }
})

ipcMain.handle('capture:getRecent', async (_event, payload) => {
  try {
    const limit = (payload && typeof payload.limit === 'number' && payload.limit > 0) ? payload.limit : 20
    const list = loadScreenshotsIndex()
    return {
      success: true,
      data: list.slice(0, limit),
    }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('capture:delete', async (_event, payload) => {
  try {
    const rawFilename = typeof payload === 'string'
      ? payload
      : (payload && typeof payload.filename === 'string' ? payload.filename : '')
    if (!rawFilename || !rawFilename.trim()) {
      return { success: false, error: 'Filename is required.', errorCode: 'INVALID_PAYLOAD' }
    }
    const filename = rawFilename.trim()
    if (!isValidFilename(filename)) {
      return { success: false, error: 'Invalid or unsafe screenshot filename.', errorCode: 'STORAGE_ERROR' }
    }
    const screenshotsDir = getScreenshotsDir()
    const targetPath = path.join(screenshotsDir, filename)

    if (!isPathSafe(targetPath, screenshotsDir)) {
      return { success: false, error: 'Path traversal detected.', errorCode: 'STORAGE_ERROR' }
    }

    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath)
    }

    const list = loadScreenshotsIndex().filter(item => item.filename !== filename)
    saveScreenshotsIndex(list)

    return { success: true, filename }
  } catch (err) {
    return { success: false, error: String(err), errorCode: 'STORAGE_ERROR' }
  }
})

ipcMain.handle('capture:readImage', async (_event, payload) => {
  try {
    const rawFilename = typeof payload === 'string'
      ? payload
      : (payload && typeof payload.filename === 'string' ? payload.filename : '')
    if (!rawFilename || !rawFilename.trim()) {
      return { success: false, error: 'Filename is required.' }
    }
    const filename = rawFilename.trim()
    if (!isValidFilename(filename)) {
      return { success: false, error: 'Invalid or unsafe screenshot filename.' }
    }
    const screenshotsDir = getScreenshotsDir()
    const targetPath = path.join(screenshotsDir, filename)
    if (!isPathSafe(targetPath, screenshotsDir) || !fs.existsSync(targetPath)) {
      return { success: false, error: 'Screenshot file not found.' }
    }
    const buf = fs.readFileSync(targetPath)
    return {
      success: true,
      dataUrl: `data:image/png;base64,${buf.toString('base64')}`,
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

// ─── Phase 8: Schedule, Background Settings & Onboarding IPC ───

ipcMain.handle('settings:getBackgroundSettings', async () => {
  const settings = loadBackgroundSettings()
  return { success: true, data: settings }
})

ipcMain.handle('settings:setBackgroundSettings', async (_event, settings) => {
  try {
    if (!settings || typeof settings !== 'object') {
      return { success: false, error: 'Invalid settings payload' }
    }
    const current = loadBackgroundSettings()
    const updated = {
      minimizeToTrayOnClose: typeof settings.minimizeToTrayOnClose === 'boolean'
        ? settings.minimizeToTrayOnClose
        : current.minimizeToTrayOnClose,
      launchOnStartup: typeof settings.launchOnStartup === 'boolean'
        ? settings.launchOnStartup
        : current.launchOnStartup,
    }
    saveBackgroundSettings(updated)

    if (process.platform === 'win32' || process.platform === 'darwin') {
      try {
        app.setLoginItemSettings({
          openAtLogin: updated.launchOnStartup,
          openAsHidden: updated.minimizeToTrayOnClose,
        })
      } catch (err) {
        console.warn('[Employee Main] Failed to set login item settings:', err)
      }
    }

    return { success: true, data: updated }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('onboarding:getRecord', async () => {
  const rec = loadOnboardingRecord()
  return { success: true, data: rec }
})

ipcMain.handle('onboarding:saveRecord', async (_event, record) => {
  if (record && typeof record === 'object') {
    saveOnboardingRecord(record)
    return { success: true, data: record }
  }
  return { success: false, error: 'Invalid record' }
})

ipcMain.handle('schedule:setConfig', async (_event, cfg) => {
  if (cfg && typeof cfg === 'object') {
    if (typeof cfg.startHour === 'number') activeScheduleConfig.startHour = cfg.startHour
    if (typeof cfg.startMinute === 'number') activeScheduleConfig.startMinute = cfg.startMinute
    if (typeof cfg.endHour === 'number') activeScheduleConfig.endHour = cfg.endHour
    if (typeof cfg.endMinute === 'number') activeScheduleConfig.endMinute = cfg.endMinute
    return { success: true, data: activeScheduleConfig }
  }
  return { success: false, error: 'Invalid config payload' }
})

ipcMain.handle('schedule:getConfig', async () => {
  return { success: true, data: activeScheduleConfig }
})

ipcMain.handle('schedule:getStatus', async () => {
  const now = new Date()
  const inHours = isWithinWorkingHours(now)
  const state = loadScheduleState()
  const activeFile = getActiveSessionFilePath()
  let active = null
  if (fs.existsSync(activeFile)) {
    try { active = JSON.parse(fs.readFileSync(activeFile, 'utf8')) } catch {}
  }
  return {
    success: true,
    data: {
      isWithinHours: inHours,
      activeSessionId: active ? active.id : null,
      sessionStatus: active ? active.status : null,
      manualStopRecordedForToday: state.manualStopDateStr === getTodayDateStr(now),
    }
  }
})

ipcMain.handle('schedule:evaluate', async () => {
  evaluateScheduleInBackground()
  return { success: true }
})

ipcMain.handle('schedule:recordManualStop', async () => {
  const now = new Date()
  const state = loadScheduleState()
  saveScheduleState({
    ...state,
    manualStopDateStr: getTodayDateStr(now),
    lastHeartbeatIso: now.toISOString(),
  })
  updateTrayMenu('Session Manually Ended')
  return { success: true }
})

ipcMain.handle('schedule:recordManualStart', async () => {
  const now = new Date()
  const state = loadScheduleState()
  saveScheduleState({
    ...state,
    manualStopDateStr: undefined,
    lastHeartbeatIso: now.toISOString(),
  })
  updateTrayMenu('Working (Manual Start)')
  return { success: true }
})

ipcMain.handle('tray:updateStatus', async (_event, statusText) => {
  if (typeof statusText === 'string') {
    updateTrayMenu(statusText)
  }
  return { success: true }
})

