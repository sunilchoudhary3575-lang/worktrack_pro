import { useState, useEffect, useRef } from 'react'
import {
  Play, Square, Monitor, Clock, Shield, LogOut, AlertTriangle,
  CheckCircle, X, Loader2, Coffee, Bell, ChevronDown,
  ChevronUp, Lock, Laptop, ArrowDownToLine, RefreshCw,
  Sparkles, Check, Info, Calendar, History, ArrowRight,
  StopCircle, CheckCircle2, XCircle, ShieldAlert, FileText, Zap,
  Camera, Image as ImageIcon, Trash2, Eye, HardDrive, Settings
} from 'lucide-react'
import type { DeviceIdentity } from '../App'
import type {
  WorkSession,
  WorkSessionState,
  BreakReason,
  DeviceRegistrationRecord,
  ScreenViewRequest,
  PreAuthorizationRecord,
  LocalScreenshotMetadata,
  ScheduleStatusInfo,
  BackgroundSettings,
} from '@worktrack-pro/shared'
import { CURRENT_PRE_AUTH_POLICY, DEFAULT_BACKGROUND_SETTINGS } from '@worktrack-pro/shared'
import { sessionService } from '../services/sessionService'
import { deviceService } from '../services/deviceService'
import { permissionService } from '../services/permissionService'
import { screenshotService } from '../services/screenshotService'
import { scheduleService } from '../services/scheduleService'
import WindowControls from '../components/WindowControls'


interface Props {
  identity: DeviceIdentity
  onLogout: () => void
}

interface BreakOption {
  id: BreakReason
  label: string
  icon: string
  defaultMinutes?: number
}

const BREAK_OPTIONS: BreakOption[] = [
  { id: 'coffee', label: 'Tea / Coffee', icon: '☕', defaultMinutes: 15 },
  { id: 'lunch', label: 'Lunch Break', icon: '🥪', defaultMinutes: 45 },
  { id: 'personal', label: 'Personal Errands', icon: '🌿', defaultMinutes: 15 },
  { id: 'other', label: 'Other', icon: '💬' },
]

export default function WorkScreen({ identity, onLogout }: Props) {
  // Session & registration data
  const [activeSession, setActiveSession] = useState<WorkSession | null>(null)
  const [sessionState, setSessionState] = useState<WorkSessionState>('not_started')
  const [regRecord, setRegRecord] = useState<DeviceRegistrationRecord | null>(null)
  const [historySessions, setHistorySessions] = useState<WorkSession[]>([])

  // Live Durations (calculated via actual timestamps)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [workSeconds, setWorkSeconds] = useState(0)
  const [breakSeconds, setBreakSeconds] = useState(0)

  // Loading & Action locks
  const [isLoading, setIsLoading] = useState(true)
  const [actionInProgress, setActionInProgress] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Modals & Panels
  const [showBreakModal, setShowBreakModal] = useState(false)
  const [selectedReason, setSelectedReason] = useState<BreakReason>('coffee')
  const [customReason, setCustomReason] = useState('')
  const [breakError, setBreakError] = useState<string | null>(null)

  const [showEndConfirmModal, setShowEndConfirmModal] = useState(false)
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [showTrayNotice, setShowTrayNotice] = useState(false)

  // ─── Phase 6: Permission & Monitoring State ─────────────────
  const [pendingRequest, setPendingRequest] = useState<ScreenViewRequest | null>(null)
  const [activeApprovedRequest, setActiveApprovedRequest] = useState<ScreenViewRequest | null>(null)
  const [preAuthRecord, setPreAuthRecord] = useState<PreAuthorizationRecord | null>(null)
  const [showConsentModal, setShowConsentModal] = useState(false)
  const [showPreAuthModal, setShowPreAuthModal] = useState(false)
  const [dismissedRequestId, setDismissedRequestId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [showRejectionInput, setShowRejectionInput] = useState(false)
  const [permissionError, setPermissionError] = useState<string | null>(null)
  const [permissionProcessing, setPermissionProcessing] = useState(false)
  const [preAuthProcessing, setPreAuthProcessing] = useState(false)
  const [consentRemainingSec, setConsentRemainingSec] = useState<number | null>(null)

  // ─── Phase 7: Local Screenshot State ────────────────────────
  const [isCapturing, setIsCapturing] = useState(false)
  const [captureStatusMessage, setCaptureStatusMessage] = useState<string | null>(null)
  const [previewScreenshot, setPreviewScreenshot] = useState<(LocalScreenshotMetadata & { dataUrl?: string }) | null>(null)
  const [recentScreenshots, setRecentScreenshots] = useState<LocalScreenshotMetadata[]>([])
  const [showScreenshotsDrawer, setShowScreenshotsDrawer] = useState(false)

  // ─── Phase 8: Schedule & Background Execution State ─────────
  const [scheduleStatus, setScheduleStatus] = useState<ScheduleStatusInfo | null>(null)
  const [backgroundSettings, setBackgroundSettings] = useState<BackgroundSettings>({ ...DEFAULT_BACKGROUND_SETTINGS })
  const [showSettingsModal, setShowSettingsModal] = useState(false)

  // ─── Automatic Screenshot Cloud Monitoring State ─────────────
  const [lastAutoCaptureAt, setLastAutoCaptureAt] = useState<string | null>(null)

  // ─── 1. Load Initial State & Recovery ──────────────────────
  useEffect(() => {
    loadInitialData()
  }, [])

  const loadInitialData = async () => {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const [reg, active, history, screenshots, schedStatus, bgSettings] = await Promise.all([
        deviceService.getRegistrationRecord(),
        sessionService.getActiveSession(),
        sessionService.getHistory(),
        screenshotService.getRecentScreenshots(20),
        scheduleService.getScheduleStatus(),
        scheduleService.getBackgroundSettings(),
      ])

      setRegRecord(reg)
      setActiveSession(active)
      setHistorySessions(history)
      setRecentScreenshots(screenshots)
      setScheduleStatus(schedStatus)
      setBackgroundSettings(bgSettings)
      if (screenshots && screenshots.length > 0) {
        setShowScreenshotsDrawer(true)
      }

      if (active) {
        if (active.status === 'working' || active.status === 'active') {
          setSessionState('working')
        } else if (active.status === 'on_break' || active.status === 'paused') {
          setSessionState('on_break')
        } else if (active.status === 'ended') {
          setSessionState('ended')
        }
      } else {
        setSessionState('not_started')
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to initialize session data.')
    } finally {
      setIsLoading(false)
    }
  }

  // ─── Phase 8: Schedule Background Evaluation & Sync ────────
  useEffect(() => {
    const updateSchedule = async () => {
      try {
        const res = await scheduleService.evaluateSchedule()
        if (res && res.action === 'ended') {
          await loadInitialData()
        }
        const status = await scheduleService.getScheduleStatus()
        setScheduleStatus(status)
      } catch {
        // quiet poll
      }
    }

    updateSchedule()
    const timer = setInterval(updateSchedule, 15000)
    const unsubCloud = scheduleService.subscribeToCloudSchedule()

    const api = typeof window !== 'undefined' ? (window as any).electronAPI : null
    let unlisten: (() => void) | null = null
    if (api?.on) {
      unlisten = api.on('session:scheduleUpdated', () => {
        loadInitialData()
      })
    }

    return () => {
      clearInterval(timer)
      unsubCloud()
      if (unlisten) unlisten()
    }
  }, [])

  // ─── Phase 6: Screen View Request Polling & Sync ───────────
  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const [pending, active, auth] = await Promise.all([
          permissionService.getPendingRequestForDevice(identity.deviceId),
          permissionService.getActiveApprovedRequest(identity.deviceId),
          permissionService.getPreAuthorization(identity.deviceId),
        ])

        setActiveApprovedRequest(active)
        setPendingRequest(pending)
        setPreAuthRecord(auth)

        if (pending) {
          if (dismissedRequestId !== pending.id) {
            setShowConsentModal(true)
          }
          if (pending.expiresAt) {
            const diff = Math.ceil((new Date(pending.expiresAt).getTime() - Date.now()) / 1000)
            setConsentRemainingSec(Math.max(0, diff))
          } else {
            setConsentRemainingSec(null)
          }
        } else {
          setShowConsentModal(false)
          setConsentRemainingSec(null)
        }
      } catch {
        // quiet poll
      }
    }

    checkPermissions()
    const timer = setInterval(checkPermissions, 1500)
    return () => clearInterval(timer)
  }, [identity.deviceId, dismissedRequestId])

  // ─── 2. Accurate Timestamp-Driven Timer Loop ────────────────
  useEffect(() => {
    if (!activeSession || (sessionState !== 'working' && sessionState !== 'on_break')) {
      if (!activeSession) {
        setElapsedSeconds(0)
        setWorkSeconds(0)
        setBreakSeconds(0)
      }
      return
    }

    // Immediately compute on mount/state-change
    const update = () => {
      const now = new Date()
      const durations = sessionService.calculateDurations(activeSession, now)
      setElapsedSeconds(durations.elapsedSeconds)
      setBreakSeconds(durations.breakSeconds)
      setWorkSeconds(durations.workSeconds)
    }

    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [activeSession, sessionState])

  // ─── Automatic Screenshot Monitoring & Cloud Delivery ───────
  useEffect(() => {
    const isWorkingSession = sessionState === 'working'
    const isDeviceApproved = regRecord?.status === 'approved'
    const isAuthorized =
      (preAuthRecord && preAuthRecord.status === 'granted') ||
      Boolean(activeApprovedRequest && (activeApprovedRequest.status === 'approved' || activeApprovedRequest.status === 'active'))

    const shouldAutoCapture = isWorkingSession && activeSession && isDeviceApproved && isAuthorized

    if (shouldAutoCapture) {
      screenshotService.startAutoCapture({
        deviceId: identity.deviceId,
        sessionId: activeSession.id,
        employeeId: identity.employeeId,
        employeeName: identity.employeeName,
        intervalSeconds: 300,
        checkScheduleHours: true,
        onCapture: (res) => {
          if (res.success && res.data) {
            setLastAutoCaptureAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
            screenshotService.getRecentScreenshots(20).then(setRecentScreenshots).catch(() => {})
          }
        },
        onUploadSuccess: () => {
          showToast('📸 Screenshot recorded and delivered to cloud storage.')
        },
      })
    } else {
      screenshotService.stopAutoCapture()
    }

    return () => {
      screenshotService.stopAutoCapture()
    }
  }, [sessionState, activeSession?.id, regRecord?.status, preAuthRecord?.status, activeApprovedRequest?.status, identity.deviceId, identity.employeeId, identity.employeeName])

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3500)
  }

  // ─── 3. Session Operations ──────────────────────────────────

  const handleStartWork = async () => {
    if (actionInProgress) return
    setErrorMessage(null)

    // Check device registration status
    if (regRecord?.status !== 'approved') {
      setErrorMessage(
        `Access restricted: Device registration is currently "${regRecord?.status || 'not_registered'}". You cannot start a session until an administrator approves this device.`
      )
      return
    }

    setActionInProgress(true)
    try {
      await scheduleService.recordManualStart()
      const session = await sessionService.startWork({
        deviceId: identity.deviceId,
        employeeId: identity.employeeId,
      })
      setActiveSession(session)
      setSessionState('working')
      const sched = await scheduleService.getScheduleStatus()
      setScheduleStatus(sched)
      showToast('🟢 Work session started successfully.')
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to start session.')
    } finally {
      setActionInProgress(false)
    }
  }

  const handleOpenBreakSelector = () => {
    setBreakError(null)
    setSelectedReason('coffee')
    setCustomReason('')
    setShowBreakModal(true)
  }

  const handleConfirmStartBreak = async () => {
    if (actionInProgress) return
    setBreakError(null)

    if (!selectedReason) {
      setBreakError('Please select a break reason.')
      return
    }

    if (selectedReason === 'other' && !customReason.trim()) {
      setBreakError('Please provide a description for the "Other" reason.')
      return
    }

    setActionInProgress(true)
    try {
      const updated = await sessionService.startBreak(selectedReason, {
        customReason: selectedReason === 'other' ? customReason.trim() : undefined,
      })
      setActiveSession(updated)
      setSessionState('on_break')
      setShowBreakModal(false)
      const opt = BREAK_OPTIONS.find(b => b.id === selectedReason)
      showToast(`☕ Break started: ${opt?.label || selectedReason}`)
    } catch (err: any) {
      setBreakError(err?.message || 'Failed to start break.')
    } finally {
      setActionInProgress(false)
    }
  }

  const handleResumeWork = async () => {
    if (actionInProgress) return
    setErrorMessage(null)
    setActionInProgress(true)
    try {
      const updated = await sessionService.resumeWork()
      setActiveSession(updated)
      setSessionState('working')
      showToast('▶ Break ended — Active work session resumed.')
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to resume work.')
    } finally {
      setActionInProgress(false)
    }
  }

  const handleEndSessionClick = () => {
    setShowEndConfirmModal(true)
  }

  const handleConfirmEndSession = async () => {
    if (actionInProgress) return
    setActionInProgress(true)
    setErrorMessage(null)
    try {
      await scheduleService.recordManualStop()
      const ended = await sessionService.endWork()
      setActiveSession(null)
      setSessionState('not_started')
      setShowEndConfirmModal(false)

      // Refresh history list
      const updatedHistory = await sessionService.getHistory()
      setHistorySessions(updatedHistory)
      const sched = await scheduleService.getScheduleStatus()
      setScheduleStatus(sched)

      showToast('🛑 Work session completed and archived.')
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to end session.')
    } finally {
      setActionInProgress(false)
    }
  }

  const handleToggleMinimizeToTray = async (val: boolean) => {
    const updated = await scheduleService.saveBackgroundSettings({ minimizeToTrayOnClose: val })
    setBackgroundSettings(updated)
    showToast(val ? 'System tray minimize enabled on close.' : 'Standard window close enabled.')
  }

  const handleToggleLaunchOnStartup = async (val: boolean) => {
    const updated = await scheduleService.saveBackgroundSettings({ launchOnStartup: val })
    setBackgroundSettings(updated)
    showToast(val ? 'Launch on Windows startup enabled.' : 'Launch on startup disabled.')
  }

  // ─── Phase 6: Permission Consent Handlers ──────────────────
  const handleApproveMonitoring = async () => {
    if (!pendingRequest || permissionProcessing) return
    setPermissionProcessing(true)
    setPermissionError(null)
    try {
      const approved = await permissionService.approveRequest(pendingRequest.id, identity.deviceId)
      setActiveApprovedRequest(approved)
      setPendingRequest(null)
      setShowConsentModal(false)
      showToast(`🟢 Screen view permission granted to ${approved.adminName}`)
    } catch (err: any) {
      setPermissionError(err?.message || 'Failed to approve request.')
    } finally {
      setPermissionProcessing(false)
    }
  }

  const handleRejectMonitoring = async () => {
    if (!pendingRequest || permissionProcessing) return
    setPermissionProcessing(true)
    setPermissionError(null)
    try {
      await permissionService.rejectRequest(pendingRequest.id, identity.deviceId, {
        reason: rejectionReason.trim() || undefined,
      })
      setPendingRequest(null)
      setShowConsentModal(false)
      setRejectionReason('')
      setShowRejectionInput(false)
      showToast('🔴 Screen view request was rejected.')
    } catch (err: any) {
      setPermissionError(err?.message || 'Failed to reject request.')
    } finally {
      setPermissionProcessing(false)
    }
  }

  const handleStopSharing = async () => {
    if (!activeApprovedRequest || permissionProcessing) return
    setPermissionProcessing(true)
    try {
      await permissionService.stopSharing(activeApprovedRequest.id, identity.deviceId, {
        stoppedBy: 'employee',
      })
      setActiveApprovedRequest(null)
      showToast('🛑 Screen sharing stopped immediately.')
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to stop sharing.')
    } finally {
      setPermissionProcessing(false)
    }
  }

  const handleCloseConsentModal = () => {
    // Closing the modal does NOT grant permission
    if (pendingRequest) {
      setDismissedRequestId(pendingRequest.id)
    }
    setShowConsentModal(false)
  }

  // ─── Pre-Authorization Policy Handlers ──────────────────────
  const handleGrantPreAuth = async () => {
    if (preAuthProcessing) return
    setPreAuthProcessing(true)
    setErrorMessage(null)
    try {
      const rec = await permissionService.grantPreAuthorization({
        employeeId: identity.employeeId,
        employeeName: identity.employeeName,
        deviceId: identity.deviceId,
        deviceName: identity.deviceName,
      })
      setPreAuthRecord(rec)
      setShowPreAuthModal(false)
      showToast('🟢 Pre-authorized oversight policy accepted.')
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to authorize policy.')
    } finally {
      setPreAuthProcessing(false)
    }
  }

  const handleRevokePreAuth = async () => {
    if (preAuthProcessing) return
    setPreAuthProcessing(true)
    setErrorMessage(null)
    try {
      const rec = await permissionService.revokePreAuthorization(identity.deviceId, {
        revokedBy: 'employee',
        reason: 'Revoked by employee in Employee Agent',
      })
      setPreAuthRecord(rec)
      setShowPreAuthModal(false)
      showToast('🔴 Pre-authorized oversight policy revoked.')
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to revoke authorization.')
    } finally {
      setPreAuthProcessing(false)
    }
  }

  // ─── Phase 7: Screenshot Handlers ───────────────────────────
  const handleTakeScreenshot = async () => {
    if (actionInProgress || isCapturing) return
    setErrorMessage(null)

    if (!isApproved) {
      setErrorMessage(
        `Capture blocked: Device registration is "${regRecord?.status || 'not_registered'}". Device must be approved before screenshot capture is permitted.`
      )
      return
    }

    if (!isWorking || !activeSession) {
      setErrorMessage(
        'Capture blocked: An active working session is required. Screenshot capture is not permitted during breaks or when no session is active.'
      )
      return
    }

    const isAuthorized =
      (preAuthRecord && preAuthRecord.status === 'granted') ||
      Boolean(activeApprovedRequest && (activeApprovedRequest.status === 'approved' || activeApprovedRequest.status === 'active'))

    if (!isAuthorized) {
      setErrorMessage(
        'Capture blocked: Valid monitoring authorization policy is required. Please authorize monitoring oversight before capturing screenshots.'
      )
      return
    }

    setIsCapturing(true)
    setCaptureStatusMessage('Capturing primary display for verification...')
    try {
      const res = await screenshotService.captureScreenshot({
        deviceId: identity.deviceId,
        sessionId: activeSession.id,
        employeeId: identity.employeeId,
      })

      if (!res.success) {
        setErrorMessage(res.error || 'Failed to capture screenshot.')
        return
      }

      if (res.data) {
        setPreviewScreenshot(res.data)
        const updatedList = await screenshotService.getRecentScreenshots(20)
        setRecentScreenshots(updatedList)
        setShowScreenshotsDrawer(true)
        showToast('📸 Screenshot captured and stored locally.')
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Screenshot capture failed.')
    } finally {
      setIsCapturing(false)
      setCaptureStatusMessage(null)
    }
  }

  const handleClosePreview = () => {
    setPreviewScreenshot(null)
  }

  const handleDeleteScreenshot = async (filename: string) => {
    try {
      const res = await screenshotService.deleteScreenshot(filename)
      if (res.success) {
        if (previewScreenshot?.filename === filename) {
          setPreviewScreenshot(null)
        }
        const updatedList = await screenshotService.getRecentScreenshots(20)
        setRecentScreenshots(updatedList)
        showToast('🗑️ Screenshot removed from local storage.')
      } else {
        setErrorMessage(res.error || 'Failed to delete screenshot.')
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to delete screenshot.')
    }
  }

  const handleOpenPreview = async (item: LocalScreenshotMetadata) => {
    try {
      const dataUrl = await screenshotService.getScreenshotDataUrl(item.filename)
      setPreviewScreenshot({
        ...item,
        dataUrl: dataUrl || undefined,
      })
    } catch {
      setPreviewScreenshot(item)
    }
  }


  const formatSeconds = (totalSec: number) => {
    const s = Math.max(0, Math.floor(totalSec))
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  const formatShortTime = (d?: Date | string | null) => {
    if (!d) return '—'
    const dateObj = d instanceof Date ? d : new Date(d)
    if (isNaN(dateObj.getTime())) return '—'
    return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const isApproved = regRecord?.status === 'approved'
  const isWorking = sessionState === 'working'
  const isOnBreak = sessionState === 'on_break'
  const isSessionActive = isWorking || isOnBreak

  // Find currently active break if on break
  const currentActiveBreak = isOnBreak
    ? activeSession?.breaks?.find(b => !b.endedAt)
    : null

  return (
    <div className="h-full flex flex-col bg-surface-950 text-white overflow-hidden select-none">
      {/* ── Native Frameless Titlebar ───────────────────────── */}
      <div className="h-11 border-b border-white/5 bg-surface-900/90 backdrop-blur flex items-center px-3.5 titlebar-drag flex-shrink-0">
        <div className="flex items-center gap-2 titlebar-no-drag w-full">
          <div className="w-5 h-5 rounded-lg bg-brand-600/30 border border-brand-500/30 flex items-center justify-center">
            <Shield className="w-3 h-3 text-brand-400" />
          </div>
          <span className="text-xs font-bold text-white tracking-wide">WorkTrack Pro</span>
          <span className="text-[10px] text-brand-400 font-medium px-1.5 py-0.5 rounded bg-brand-500/10 border border-brand-500/20">
            Agent
          </span>

          <div className="ml-auto flex items-center gap-2">
            {/* Device approval badge in titlebar */}
            <span
              id="device-status-badge"
              className={`flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                isApproved
                  ? 'bg-success-500/10 border-success-500/20 text-success-300'
                  : 'bg-warning-500/10 border-warning-500/20 text-warning-300'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isApproved ? 'bg-success-400' : 'bg-warning-400'}`} />
              {isApproved ? 'Approved Device' : `Status: ${regRecord?.status || 'Unapproved'}`}
            </span>

            <div className="h-3 w-px bg-white/10 mx-1" />
            <WindowControls />
          </div>
        </div>
      </div>

      {/* ── Toast Notification Bar ──────────────────────────── */}
      {toastMessage && (
        <div className="absolute top-14 left-4 right-4 z-50 animate-slide-up">
          <div className="bg-surface-800/95 border border-brand-500/40 shadow-glow-green/30 backdrop-blur-md rounded-xl p-3 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <Bell className="w-4 h-4 text-brand-400 animate-bounce" />
              <span className="font-medium text-white">{toastMessage}</span>
            </div>
            <button onClick={() => setToastMessage(null)} className="text-white/40 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Main Scrollable Body ────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Phase 8: Accessible, Persistent Monitoring & Schedule Status Indicator */}
        <div
          id="monitoring-status-indicator"
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs transition-all ${
            !isApproved || (preAuthRecord && preAuthRecord.status === 'revoked')
              ? 'bg-danger-500/10 border-danger-500/30 text-danger-300'
              : isOnBreak
              ? 'bg-warning-500/10 border-warning-500/30 text-warning-300'
              : isWorking
              ? 'bg-brand-500/10 border-brand-500/30 text-brand-300 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
              : 'bg-surface-900 border-white/10 text-white/70'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span
              className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                !isApproved || (preAuthRecord && preAuthRecord.status === 'revoked')
                  ? 'bg-danger-400'
                  : isOnBreak
                  ? 'bg-warning-400 animate-pulse'
                  : isWorking
                  ? 'bg-success-400 shadow-[0_0_8px_rgba(74,222,128,0.9)] animate-pulse'
                  : 'bg-white/40'
              }`}
            />
            <div>
              <p id="schedule-status-title" className="font-bold text-white tracking-wide">
                {scheduleStatus?.statusText || (isWorking ? '🟢 Working (Schedule Active)' : 'Scheduled (09:30 AM – 06:30 PM)')}
              </p>
              <p className="text-[10px] text-white/50">
                {isWorking
                  ? 'Automated screen capture active • Pauses during breaks & ends at 18:30'
                  : isOnBreak
                  ? 'Monitoring paused during break • Screen captures blocked'
                  : preAuthRecord?.status === 'revoked'
                  ? 'Monitoring authorization revoked • Screen captures blocked'
                  : 'Automated monitoring activates at 09:30 AM on approved devices'}
              </p>
            </div>
          </div>

          <button
            id="btn-open-background-settings"
            onClick={() => setShowSettingsModal(true)}
            className="p-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 border border-white/10 text-white/60 hover:text-white flex items-center gap-1 text-[11px]"
            title="Configure Windows background & system tray settings"
          >
            <Settings className="w-3.5 h-3.5 text-brand-400" />
            <span>Tray & Startup</span>
          </button>
        </div>

        {/* Phase 6: Active Sharing Indicator Banner */}
        {activeApprovedRequest && (
          <div
            id="active-monitoring-indicator"
            className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-950/90 via-surface-900 to-emerald-950/90 border border-success-500/40 shadow-[0_0_20px_rgba(34,197,94,0.15)] flex items-center justify-between animate-fade-in"
          >
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center">
                <span className="w-3 h-3 rounded-full bg-success-400 animate-ping absolute opacity-75" />
                <span className="w-2.5 h-2.5 rounded-full bg-success-400 relative" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-success-300 uppercase tracking-wide">
                    {activeApprovedRequest.isPreAuthorized
                      ? 'Pre-Authorized Live Screen View Active'
                      : 'Live Screen Sharing Active'}
                  </span>
                  <span className="text-[10px] bg-success-500/20 text-success-300 px-1.5 py-0.2 rounded border border-success-500/30 font-mono">
                    {activeApprovedRequest.isPreAuthorized ? 'Policy v1.0' : 'Consent-Approved'}
                  </span>
                </div>
                <p className="text-[11px] text-white/60">
                  Viewing Admin: <strong className="text-white">{activeApprovedRequest.adminName}</strong> • Session:{' '}
                  <span className="font-mono text-white/80">{activeApprovedRequest.id}</span> • Started at{' '}
                  {formatShortTime(activeApprovedRequest.respondedAt)}
                </p>
              </div>
            </div>
            <button
              id="btn-stop-sharing"
              onClick={handleStopSharing}
              disabled={permissionProcessing}
              className="btn-danger py-1.5 px-3 text-xs font-semibold flex items-center gap-1.5 shadow-[0_0_12px_rgba(239,68,68,0.25)]"
            >
              <StopCircle className="w-3.5 h-3.5" />
              Stop Sharing
            </button>
          </div>
        )}

        {/* Phase 7: Visible Screenshot Capture Progress Banner */}
        {isCapturing && (
          <div id="capture-status-indicator" className="p-3.5 rounded-xl bg-brand-500/15 border border-brand-500/40 flex items-center gap-2.5 text-xs text-brand-300 animate-pulse">
            <Camera className="w-4 h-4 text-brand-400 animate-spin flex-shrink-0" />
            <div className="flex-1 font-medium leading-relaxed">
              <span className="font-semibold text-white">Capture In Progress:</span> {captureStatusMessage || 'Capturing primary screen display...'}
            </div>
          </div>
        )}


        {/* Phase 6: Pending Request Alert (if consent modal was closed without decision) */}
        {pendingRequest && !showConsentModal && (
          <div className="p-3 rounded-xl bg-warning-500/10 border border-warning-500/30 flex items-center justify-between text-xs text-warning-300 animate-slide-up">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 animate-spin text-warning-400" />
              <span>Live view request from <strong>{pendingRequest.adminName}</strong> is pending your consent.</span>
            </div>
            <button
              onClick={() => setShowConsentModal(true)}
              className="btn-secondary py-1 px-2.5 text-xs font-semibold"
            >
              Review Request
            </button>
          </div>
        )}
        {/* Error notification banner */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-danger-500/15 border border-danger-500/30 flex items-start gap-2.5 text-xs text-danger-300 animate-fade-in">
            <AlertTriangle className="w-4 h-4 text-danger-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{errorMessage}</div>
            <button onClick={() => setErrorMessage(null)} className="text-danger-400 hover:text-danger-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Device Registration Status Alert (if not approved) */}
        {!isApproved && (
          <div className="glass-card p-4 border-warning-500/40 bg-warning-500/5 space-y-2 animate-fade-in">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning-400" />
              <span className="text-xs font-bold text-warning-300">Device Approval Required</span>
            </div>
            <p className="text-[11px] text-white/70 leading-relaxed">
              This machine is currently in state: <strong className="text-warning-300">{regRecord?.status || 'not_registered'}</strong>. Company security policy prevents starting a work session until the administrator authorizes this device.
            </p>
          </div>
        )}

        {/* ── Primary Status & Timer Card ─────────────────────── */}
        <div className={`glass-card p-5 relative overflow-hidden transition-all duration-300 ${
          isWorking
            ? 'border-brand-500/40 shadow-glow-green/20'
            : isOnBreak
            ? 'border-warning-500/40 shadow-[0_0_20px_rgba(250,204,21,0.15)]'
            : 'border-white/10'
        }`}>
          {/* Card Header: Session State & Privacy Notice */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  isWorking
                    ? 'bg-success-400 shadow-[0_0_8px_rgba(74,222,128,0.9)] animate-pulse'
                    : isOnBreak
                    ? 'bg-warning-400 shadow-[0_0_8px_rgba(250,204,21,0.9)] animate-pulse'
                    : 'bg-white/30'
                }`}
              />
              <span id="session-state-text" className="text-xs font-bold uppercase tracking-wider text-white">
                {isWorking
                  ? 'Working'
                  : isOnBreak
                  ? `On Break (${currentActiveBreak?.reason || 'Pause'})`
                  : 'Not Started'}
              </span>
            </div>

            <button
              onClick={() => setShowPrivacyModal(true)}
              className="text-[11px] text-brand-400 hover:text-brand-300 flex items-center gap-1 font-medium underline"
            >
              <Lock className="w-3 h-3" />
              Privacy & Transparency
            </button>
          </div>

          {/* Large Main Clock (Working time or Break time) */}
          <div className="text-center py-3">
            <p id="main-timer-display" className="text-4xl font-mono font-bold tracking-widest text-white drop-shadow-sm">
              {isOnBreak ? formatSeconds(breakSeconds) : formatSeconds(workSeconds)}
            </p>
            <p className="text-[11px] text-white/40 mt-1 font-mono uppercase tracking-wider">
              {isOnBreak ? 'Active Break Duration' : isWorking ? 'Net Active Work Duration' : 'Session Ready'}
            </p>
          </div>

          {/* 3-Column Metrics Breakdown */}
          <div className="grid grid-cols-3 gap-2 pt-3 pb-1 border-t border-white/5 text-center text-xs">
            <div className="p-2 rounded-xl bg-surface-900/60 border border-white/5">
              <p className="text-[10px] text-white/40 uppercase font-mono">Start Time</p>
              <p id="session-start-time" className="text-xs font-mono font-semibold text-white mt-0.5">
                {formatShortTime(activeSession?.startedAt)}
              </p>
            </div>
            <div className="p-2 rounded-xl bg-surface-900/60 border border-white/5">
              <p className="text-[10px] text-white/40 uppercase font-mono">Elapsed Session</p>
              <p id="session-elapsed-duration" className="text-xs font-mono font-semibold text-white/80 mt-0.5">
                {formatSeconds(elapsedSeconds)}
              </p>
            </div>
            <div className="p-2 rounded-xl bg-surface-900/60 border border-white/5">
              <p className="text-[10px] text-white/40 uppercase font-mono">Total Breaks</p>
              <p id="session-break-duration" className="text-xs font-mono font-semibold text-warning-400 mt-0.5">
                {formatSeconds(breakSeconds)}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-4 pt-3 border-t border-white/5 space-y-2">
            {!isSessionActive ? (
              <button
                id="btn-start-work"
                onClick={handleStartWork}
                disabled={actionInProgress || !isApproved}
                className="btn-primary w-full py-3 text-sm font-semibold shadow-glow-green disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                title={!isApproved ? 'Device must be approved to start a session' : 'Start working'}
              >
                {actionInProgress ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Starting Session...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    Start Work Session
                  </>
                )}
              </button>
            ) : isOnBreak ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  id="btn-resume-work"
                  onClick={handleResumeWork}
                  disabled={actionInProgress}
                  className="btn-primary py-2.5 text-xs font-semibold bg-brand-600 hover:bg-brand-500 flex items-center justify-center gap-1.5 shadow-glow-green"
                >
                  {actionInProgress ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-white" />
                  )}
                  Resume Work
                </button>
                <button
                  id="btn-end-work"
                  onClick={handleEndSessionClick}
                  disabled={actionInProgress}
                  className="btn-danger py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <Square className="w-3.5 h-3.5 fill-white" />
                  End Work Session
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  id="btn-take-break"
                  onClick={handleOpenBreakSelector}
                  disabled={actionInProgress}
                  className="btn-secondary py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <Coffee className="w-3.5 h-3.5 text-warning-400" />
                  Take Break
                </button>
                <button
                  id="btn-end-work"
                  onClick={handleEndSessionClick}
                  disabled={actionInProgress}
                  className="btn-danger py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <Square className="w-3.5 h-3.5 fill-white" />
                  End Work Session
                </button>
              </div>
            )}

            {/* Automated Screenshot Cloud Delivery Status Card */}
            {isWorking && (
              <div
                id="auto-screenshot-status-card"
                className="p-3.5 rounded-xl bg-surface-900/90 border border-emerald-500/30 text-xs space-y-2 shadow-[0_0_12px_rgba(16,185,129,0.1)]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Automated Cloud Delivery Active</span>
                  </div>
                  <span className="text-[10px] font-mono text-white/50">Every 5 min</span>
                </div>
                <p className="text-[11px] text-white/70 leading-relaxed">
                  Desktop activity is automatically captured and encrypted to cloud storage during active work. No manual action required.
                </p>
                <div className="flex items-center justify-between pt-1.5 border-t border-white/5 text-[10px] text-white/40">
                  <span>Last cloud delivery: <strong className="text-white/70">{lastAutoCaptureAt || 'Session initiated'}</strong></span>
                  <span className="text-emerald-400/90 font-medium">✓ Secure Storage</span>
                </div>
              </div>
            )}

            {isOnBreak && (
              <div
                id="auto-screenshot-paused-banner"
                className="p-3 rounded-xl bg-surface-900/80 border border-amber-500/20 text-xs text-amber-200/80 flex items-center gap-2"
              >
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>Monitoring paused during breaks. No screenshots are recorded.</span>
              </div>
            )}
          </div>
        </div>


        {/* ── Break Intervals History for Current Session ────── */}
        {activeSession && activeSession.breaks && activeSession.breaks.length > 0 && (
          <div className="glass-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1.5">
                <Coffee className="w-3.5 h-3.5 text-warning-400" />
                Session Break Log ({activeSession.breaks.length})
              </span>
              <span className="text-[11px] font-mono text-warning-400">
                Sum: {formatSeconds(breakSeconds)}
              </span>
            </div>

            <div className="space-y-2">
              {activeSession.breaks.map((brk, idx) => {
                const opt = BREAK_OPTIONS.find(o => o.id === brk.reason)
                const isActive = !brk.endedAt
                const dur = brk.durationSeconds ?? Math.max(0, Math.floor(((brk.endedAt ? new Date(brk.endedAt).getTime() : Date.now()) - new Date(brk.startedAt).getTime()) / 1000))

                return (
                  <div
                    key={brk.id || idx}
                    className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                      isActive
                        ? 'bg-warning-500/10 border-warning-500/30 text-warning-300'
                        : 'bg-surface-900/60 border-white/5 text-white/80'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">{opt?.icon || '☕'}</span>
                      <div>
                        <p className="font-semibold text-white capitalize">
                          {brk.reason}
                          {brk.customReason ? ` • ${brk.customReason}` : ''}
                        </p>
                        <p className="text-[10px] text-white/40">
                          {formatShortTime(brk.startedAt)} → {isActive ? 'Ongoing' : formatShortTime(brk.endedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`font-mono text-xs font-semibold ${isActive ? 'text-warning-400 animate-pulse' : 'text-white/70'}`}>
                        {formatSeconds(dur)}
                      </span>
                      {isActive && <p className="text-[9px] text-warning-400">Active</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Summary & Completed Sessions History ────────────── */}
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-brand-400" />
              Recent Completed Sessions ({historySessions.length})
            </span>
            <button
              onClick={() => setShowHistoryModal(prev => !prev)}
              className="text-[11px] text-brand-400 hover:text-brand-300 underline font-medium"
            >
              {showHistoryModal ? 'Hide Log' : 'View History'}
            </button>
          </div>

          {showHistoryModal && (
            <div className="space-y-2 pt-2 border-t border-white/5 animate-slide-up">
              {historySessions.length === 0 ? (
                <p className="text-xs text-white/40 text-center py-3">No completed sessions logged yet.</p>
              ) : (
                historySessions.slice(0, 5).map((sess, idx) => (
                  <div key={sess.id || idx} className="p-2.5 rounded-xl bg-surface-900 border border-white/5 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-white">
                        {formatShortTime(sess.startedAt)} - {formatShortTime(sess.endedAt)}
                      </p>
                      <p className="text-[10px] text-white/40 font-mono">
                        Session: {sess.id.slice(0, 16)}...
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-semibold text-brand-400">
                        {formatSeconds(sess.workDurationSeconds || sess.durationSeconds || 0)}
                      </p>
                      <p className="text-[10px] text-white/40">Work Duration</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* ── Phase 8: Automated Schedule & Hours Card ────────── */}
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-brand-400" />
              Automated Schedule & Working Hours
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-brand-500/10 border border-brand-500/30 text-brand-300">
              09:30 AM – 06:30 PM
            </span>
          </div>

          <p className="text-[11px] text-white/70 leading-relaxed">
            Work sessions start automatically at 9:30 AM on approved devices and end at 6:30 PM local time. Active breaks are automatically closed at schedule conclusion.
          </p>

          <div className="p-3 rounded-xl bg-surface-900 border border-white/5 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-white/60">Schedule State:</span>
              <span className="font-semibold text-white">
                {scheduleStatus?.statusText || (isWorking ? '🟢 Working (Schedule Active)' : 'Scheduled (09:30 - 18:30)')}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/60">System Tray Minimization:</span>
              <span className={`font-mono text-[11px] ${backgroundSettings.minimizeToTrayOnClose ? 'text-brand-400 font-semibold' : 'text-white/40'}`}>
                {backgroundSettings.minimizeToTrayOnClose ? 'Enabled (Minimizes to Tray)' : 'Disabled (Window Closes)'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/60">Launch on Windows Login:</span>
              <span className={`font-mono text-[11px] ${backgroundSettings.launchOnStartup ? 'text-brand-400 font-semibold' : 'text-white/40'}`}>
                {backgroundSettings.launchOnStartup ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>

          <div className="pt-1 flex items-center justify-between">
            <button
              id="btn-configure-background-settings"
              onClick={() => setShowSettingsModal(true)}
              className="text-[11px] text-brand-400 hover:text-brand-300 underline font-medium flex items-center gap-1"
            >
              <Settings className="w-3 h-3" />
              Configure Tray & Startup Preferences
            </button>
          </div>
        </div>


        {/* ── Pre-Authorized Oversight Policy Card ───────────── */}

        <div className="p-3.5 rounded-xl bg-surface-900 border border-white/5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-brand-400" />
              <span className="text-xs font-bold text-white">Pre-Authorized Oversight Policy</span>
            </div>
            <span
              id="preauth-status-badge"
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                preAuthRecord?.status === 'granted'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : preAuthRecord?.status === 'revoked'
                  ? 'bg-danger-500/10 border-danger-500/30 text-danger-400'
                  : 'bg-surface-800 border-white/10 text-white/40'
              }`}
            >
              {preAuthRecord?.status === 'granted'
                ? 'Authorized (v1.0)'
                : preAuthRecord?.status === 'revoked'
                ? 'Authorization Revoked'
                : 'Not Authorized'}
            </span>
          </div>
          <p className="text-[11px] text-white/60 leading-relaxed">
            Allows authorized security administrators to perform one-click screen inspection without per-session prompts. Real-time visual indicator remains visible during all viewing.
          </p>
          <div className="pt-1 flex items-center justify-between">
            <button
              id="btn-open-preauth-policy"
              onClick={() => setShowPreAuthModal(true)}
              className="text-[11px] text-brand-400 hover:text-brand-300 underline font-medium flex items-center gap-1"
            >
              <FileText className="w-3 h-3" />
              Configure Oversight Policy
            </button>
            {preAuthRecord?.status === 'granted' && (
              <button
                id="btn-quick-revoke-preauth"
                onClick={handleRevokePreAuth}
                disabled={preAuthProcessing}
                className="text-[11px] text-danger-400/80 hover:text-danger-300 underline"
              >
                Revoke Authorization
              </button>
            )}
          </div>
        </div>

        {/* ── Device & Hardware Profile Card ──────────────────── */}
        <div className="p-3.5 rounded-xl bg-surface-900 border border-white/5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/40 font-mono text-[11px]">Registered Machine:</span>
            <span className="text-white/90 font-mono text-[11px]">{identity.deviceName}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/40 font-mono text-[11px]">Employee:</span>
            <span className="text-white/90 font-mono text-[11px]">
              {identity.employeeName} ({identity.employeeId})
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/40 font-mono text-[11px]">Device Status:</span>
            <span className={`font-mono text-[11px] font-semibold ${isApproved ? 'text-success-400' : 'text-warning-400'}`}>
              {regRecord?.status?.toUpperCase() || 'NOT_REGISTERED'}
            </span>
          </div>
          <div className="pt-2 border-t border-white/5 flex items-center justify-between">
            <button
              onClick={() => setShowTrayNotice(prev => !prev)}
              className="text-[11px] text-white/40 hover:text-white flex items-center gap-1"
            >
              <ArrowDownToLine className="w-3 h-3" />
              {showTrayNotice ? 'Hide Tray Info' : 'System Tray'}
            </button>
            <button
              id="btn-sign-out"
              onClick={onLogout}
              disabled={isSessionActive}
              className="text-[11px] text-danger-400/80 hover:text-danger-400 flex items-center gap-1 disabled:opacity-30 disabled:hover:text-danger-400/80"
              title={isSessionActive ? 'End your active work session before signing out' : 'Sign out device'}
            >
              <LogOut className="w-3 h-3" />
              Sign Out Device
            </button>
          </div>
          {showTrayNotice && (
            <p className="text-[10px] text-white/50 bg-surface-800 p-2 rounded-lg mt-1 leading-relaxed">
              💡 WorkTrack Pro maintains your session while minimized. Closing this window will minimize to the Windows Notification Area.
            </p>
          )}
        </div>
      </div>

      {/* ── MODAL: Break Reason Selector ─────────────────────── */}
      {showBreakModal && (
        <div className="fixed inset-0 z-50 bg-surface-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm glass-card p-5 space-y-4 animate-slide-up border-warning-500/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coffee className="w-4 h-4 text-warning-400" />
                <h3 className="text-sm font-bold text-white">Select Break Reason</h3>
              </div>
              <button
                onClick={() => setShowBreakModal(false)}
                className="text-white/40 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-white/60">
              Please specify a reason for taking this pause. Work timers and monitoring will pause until you resume.
            </p>

            {breakError && (
              <div className="p-2.5 rounded-lg bg-danger-500/15 border border-danger-500/30 text-xs text-danger-300">
                {breakError}
              </div>
            )}

            {/* Reason grid options */}
            <div className="grid grid-cols-2 gap-2">
              {BREAK_OPTIONS.map(opt => {
                const isSelected = selectedReason === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedReason(opt.id)}
                    className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'bg-warning-500/15 border-warning-500 text-white shadow-[0_0_12px_rgba(250,204,21,0.2)]'
                        : 'bg-surface-900 border-white/5 text-white/70 hover:bg-surface-800'
                    }`}
                  >
                    <span className="text-lg">{opt.icon}</span>
                    <div className="mt-2">
                      <p className="text-xs font-semibold">{opt.label}</p>
                      {opt.defaultMinutes && (
                        <p className="text-[10px] text-white/40">~{opt.defaultMinutes} mins</p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Custom Reason Input if "Other" is selected */}
            {selectedReason === 'other' && (
              <div className="space-y-1 animate-slide-up">
                <label className="text-[11px] font-medium text-white/50 uppercase">
                  Describe Reason *
                </label>
                <input
                  id="break-custom-reason"
                  type="text"
                  placeholder="e.g. Doctor appointment, client travel..."
                  value={customReason}
                  onChange={e => setCustomReason(e.target.value)}
                  className="input-field py-2 text-xs"
                  autoFocus
                />
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBreakModal(false)}
                className="btn-secondary flex-1 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-break"
                type="button"
                onClick={handleConfirmStartBreak}
                disabled={actionInProgress}
                className="btn-primary flex-1 py-2 text-xs bg-warning-600 hover:bg-warning-500 font-semibold shadow-none flex items-center justify-center gap-1.5"
              >
                {actionInProgress ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Coffee className="w-3.5 h-3.5" />
                )}
                Start Break
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: End Work Confirmation ─────────────────────── */}
      {showEndConfirmModal && (
        <div className="fixed inset-0 z-50 bg-surface-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm glass-card p-5 space-y-4 animate-slide-up border-danger-500/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-danger-500/20 border border-danger-500/30 flex items-center justify-center flex-shrink-0">
                <Square className="w-5 h-5 text-danger-400 fill-danger-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">End Work Session?</h3>
                <p className="text-[11px] text-white/50">Confirm session finalization</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-surface-900 border border-white/5 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-white/40">Total Elapsed:</span>
                <span className="font-mono font-semibold text-white">{formatSeconds(elapsedSeconds)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Net Work Time:</span>
                <span className="font-mono font-semibold text-success-400">{formatSeconds(workSeconds)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Total Break Time:</span>
                <span className="font-mono font-semibold text-warning-400">{formatSeconds(breakSeconds)}</span>
              </div>
            </div>

            {isOnBreak && (
              <div className="p-2.5 rounded-lg bg-warning-500/10 border border-warning-500/20 text-[11px] text-warning-300">
                ⚠ You are currently on break. Ending the session will automatically close this active break at the current timestamp.
              </div>
            )}

            <p className="text-[11px] text-white/60 leading-relaxed">
              Once ended, this session will be safely archived to local history. Are you sure you wish to clock out now?
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowEndConfirmModal(false)}
                className="btn-secondary flex-1 py-2 text-xs"
                disabled={actionInProgress}
              >
                Cancel
              </button>
              <button
                id="btn-confirm-end-work"
                type="button"
                onClick={handleConfirmEndSession}
                disabled={actionInProgress}
                className="btn-danger flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                {actionInProgress ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                Confirm & End
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Privacy & Transparency ────────────────────── */}
      {showPrivacyModal && (
        <div className="fixed inset-0 z-50 bg-surface-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm glass-card p-5 space-y-4 animate-slide-up border-brand-500/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-brand-400" />
                <h3 className="text-sm font-bold text-white">Employee Privacy Guarantee</h3>
              </div>
              <button onClick={() => setShowPrivacyModal(false)} className="text-white/40 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-success-500/10 border border-success-500/20 space-y-1">
                <p className="font-semibold text-success-400 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" /> Visible Tracking Policy:
                </p>
                <ul className="list-disc list-inside text-white/70 space-y-0.5 text-[11px]">
                  <li>Work sessions only record when explicitly started.</li>
                  <li>Breaks accurately pause all duration and work tracking.</li>
                  <li>Transparent timestamps stored locally and verifiable.</li>
                </ul>
              </div>

              <div className="p-3 rounded-xl bg-danger-500/10 border border-danger-500/20 space-y-1">
                <p className="font-semibold text-danger-400 flex items-center gap-1.5">
                  <X className="w-3.5 h-3.5" /> Strictly Prohibited:
                </p>
                <ul className="list-disc list-inside text-white/70 space-y-0.5 text-[11px]">
                  <li>No keystroke logging or password capture.</li>
                  <li>No covert background recording or webcam access.</li>
                  <li>No tracking while on break, paused, or logged out.</li>
                </ul>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowPrivacyModal(false)}
              className="btn-primary w-full py-2 text-xs font-semibold"
            >
              Close Notice
            </button>
          </div>
        </div>
      )}

      {/* ── Phase 6: MODAL: Consent & Permission Prompt ──────── */}
      {showConsentModal && pendingRequest && (
        <div className="fixed inset-0 z-50 bg-surface-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-card p-6 space-y-4 animate-slide-up border-brand-500/40 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center">
                  <Monitor className="w-5 h-5 text-brand-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Live Screen View Consent Requested</h3>
                  <p className="text-[11px] text-white/50">Employee authorization required</p>
                </div>
              </div>
              <button
                id="btn-dismiss-consent"
                onClick={handleCloseConsentModal}
                className="text-white/40 hover:text-white transition-colors"
                title="Dismiss dialog without approving"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {permissionError && (
              <div className="p-3 rounded-lg bg-danger-500/15 border border-danger-500/30 text-xs text-danger-300">
                {permissionError}
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-surface-900 border border-white/5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-white/40">Requesting Admin:</span>
                <span className="font-semibold text-white">{pendingRequest.adminName} ({pendingRequest.adminId})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Request Time:</span>
                <span className="font-mono text-white/80">{new Date(pendingRequest.requestedAt).toLocaleTimeString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Target Device:</span>
                <span className="font-mono text-white/80">{identity.deviceName}</span>
              </div>
              {consentRemainingSec !== null && (
                <div className="flex justify-between items-center pt-1 border-t border-white/5">
                  <span className="text-white/40">Request Expiration:</span>
                  <span className={`font-mono font-bold ${consentRemainingSec < 15 ? 'text-danger-400 animate-pulse' : 'text-warning-400'}`}>
                    {consentRemainingSec > 0 ? `Expires in ${consentRemainingSec}s` : 'Request Expired'}
                  </span>
                </div>
              )}
            </div>

            <div className="p-3 rounded-xl bg-brand-500/10 border border-brand-500/20 text-[11px] text-brand-200 leading-relaxed space-y-1">
              <p>
                <strong>Permission Details:</strong> An administrator is requesting permission to view your screen in real time.
              </p>
              <p className="text-white/60">
                In this phase, permissions and consent lifecycles are simulated. You maintain full transparency and can stop sharing at any time.
              </p>
            </div>

            {showRejectionInput && (
              <div className="space-y-1.5 animate-slide-up">
                <label className="text-[11px] font-medium text-white/60">Optional Rejection Reason:</label>
                <input
                  id="rejection-reason-input"
                  type="text"
                  placeholder="e.g. In confidential meeting, personal break..."
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  className="input-field py-2 text-xs"
                  autoFocus
                />
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              {!showRejectionInput ? (
                <button
                  id="btn-show-reject"
                  type="button"
                  onClick={() => setShowRejectionInput(true)}
                  className="btn-secondary py-2.5 px-3 text-xs flex-1 text-danger-300 hover:text-danger-200 border-danger-500/30"
                  disabled={permissionProcessing}
                >
                  Reject Request...
                </button>
              ) : (
                <button
                  id="btn-confirm-reject"
                  type="button"
                  onClick={handleRejectMonitoring}
                  disabled={permissionProcessing}
                  className="btn-danger py-2.5 px-3 text-xs flex-1 font-semibold flex items-center justify-center gap-1.5"
                >
                  {permissionProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                  Confirm Rejection
                </button>
              )}

              <button
                id="btn-approve-monitoring"
                type="button"
                onClick={handleApproveMonitoring}
                disabled={permissionProcessing || (consentRemainingSec !== null && consentRemainingSec <= 0)}
                className="btn-primary py-2.5 px-4 text-xs flex-1 font-semibold shadow-glow-green flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                {permissionProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Approve Live View
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── MODAL: Pre-Authorized Oversight Policy ──────────── */}
      {showPreAuthModal && (
        <div className="fixed inset-0 z-50 bg-surface-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-card p-6 space-y-4 animate-slide-up border-brand-500/40 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-brand-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{CURRENT_PRE_AUTH_POLICY.name}</h3>
                  <p className="text-[11px] text-brand-400 font-mono">Policy {CURRENT_PRE_AUTH_POLICY.version}</p>
                </div>
              </div>
              <button
                id="btn-close-preauth-modal"
                onClick={() => setShowPreAuthModal(false)}
                className="text-white/40 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-white/70 leading-relaxed">
              {CURRENT_PRE_AUTH_POLICY.description}
            </p>

            <div className="p-3.5 rounded-xl bg-surface-900 border border-white/5 space-y-2 text-xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/60">Policy Safeguards & Limits:</p>
              <ul className="space-y-1.5 text-white/80">
                {CURRENT_PRE_AUTH_POLICY.scope.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-[11px]">
                    <Check className="w-3.5 h-3.5 text-success-400 flex-shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-3 rounded-xl bg-surface-900 border border-white/5 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-white/40">Current Status:</span>
                <span className={`font-semibold ${preAuthRecord?.status === 'granted' ? 'text-success-400' : 'text-warning-400'}`}>
                  {preAuthRecord?.status?.toUpperCase() || 'NOT CONFIGURED'}
                </span>
              </div>
              {preAuthRecord?.grantedAt && (
                <div className="flex justify-between">
                  <span className="text-white/40">Authorized At:</span>
                  <span className="font-mono text-white/70">{new Date(preAuthRecord.grantedAt).toLocaleString()}</span>
                </div>
              )}
              {preAuthRecord?.revokedAt && (
                <div className="flex justify-between">
                  <span className="text-white/40">Revoked At:</span>
                  <span className="font-mono text-danger-400">{new Date(preAuthRecord.revokedAt).toLocaleString()}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPreAuthModal(false)}
                className="btn-secondary flex-1 py-2 text-xs"
                disabled={preAuthProcessing}
              >
                Close
              </button>

              {preAuthRecord?.status === 'granted' ? (
                <button
                  id="btn-revoke-preauth"
                  type="button"
                  onClick={handleRevokePreAuth}
                  disabled={preAuthProcessing}
                  className="btn-danger flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  {preAuthProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <StopCircle className="w-3.5 h-3.5" />}
                  Revoke Authorization
                </button>
              ) : (
                <button
                  id="btn-grant-preauth"
                  type="button"
                  onClick={handleGrantPreAuth}
                  disabled={preAuthProcessing || !isApproved}
                  className="btn-primary flex-1 py-2 text-xs font-semibold shadow-glow-green flex items-center justify-center gap-1.5 disabled:opacity-40"
                  title={!isApproved ? 'Device must be approved to grant oversight authorization' : 'Authorize oversight policy'}
                >
                  {preAuthProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Authorize Policy
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Phase 7: Local Screenshot Preview Modal ──────────── */}
      {previewScreenshot && (
        <div id="screenshot-preview-modal" className="fixed inset-0 z-50 bg-surface-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg glass-card p-5 space-y-4 animate-slide-up border-brand-500/30 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-brand-400" />
                <h3 className="text-sm font-bold text-white">Local Screenshot Preview</h3>
              </div>
              <button
                id="btn-close-preview"
                onClick={handleClosePreview}
                className="text-white/40 hover:text-white p-1"
                title="Close Preview"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Image Preview Container */}
            <div className="rounded-xl overflow-hidden bg-black/60 border border-white/10 relative flex items-center justify-center min-h-[180px] max-h-[45vh]">
              {previewScreenshot.dataUrl ? (
                <img
                  id="preview-screenshot-image"
                  src={previewScreenshot.dataUrl}
                  alt={`Screenshot taken at ${previewScreenshot.capturedAt}`}
                  className="w-full h-auto max-h-[45vh] object-contain rounded-lg"
                />
              ) : (
                <div className="p-8 text-center text-white/40 text-xs">
                  <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No image preview available
                </div>
              )}
            </div>

            {/* Metadata Summary Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-surface-900 border border-white/5">
                <span className="text-[10px] text-white/40 uppercase font-mono block">Capture Timestamp</span>
                <span id="preview-capture-time" className="font-mono text-white font-semibold">
                  {new Date(previewScreenshot.capturedAt).toLocaleString()}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-surface-900 border border-white/5">
                <span className="text-[10px] text-white/40 uppercase font-mono block">Resolution & Size</span>
                <span id="preview-capture-dimensions" className="font-mono text-white/80">
                  {previewScreenshot.width}×{previewScreenshot.height} ({Math.round(previewScreenshot.fileSizeBytes / 1024)} KB)
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-surface-900 border border-white/5">
                <span className="text-[10px] text-white/40 uppercase font-mono block">Device ID</span>
                <span id="preview-device-id" className="font-mono text-brand-400 truncate block">
                  {previewScreenshot.deviceId}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-surface-900 border border-white/5">
                <span className="text-[10px] text-white/40 uppercase font-mono block">Session ID</span>
                <span id="preview-session-id" className="font-mono text-white/70 truncate block">
                  {previewScreenshot.sessionId}
                </span>
              </div>
            </div>

            {/* Privacy and Local Storage Notice */}
            <div className="p-3 rounded-lg bg-surface-900/80 border border-white/5 space-y-1 text-[11px] text-white/60">
              <div className="flex items-center gap-1.5 text-white/80 font-medium">
                <HardDrive className="w-3.5 h-3.5 text-brand-400" />
                <span>Local Storage Location</span>
              </div>
              <p id="preview-file-path" className="font-mono text-[10px] text-white/40 break-all">
                {previewScreenshot.filePath}
              </p>
              <p className="text-[10px] text-emerald-400/90 pt-1">
                🔒 {previewScreenshot.retentionNotice}
              </p>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/5">
              <button
                id="btn-delete-preview-screenshot"
                type="button"
                onClick={() => handleDeleteScreenshot(previewScreenshot.filename)}
                className="btn-danger py-2 px-3 text-xs font-semibold flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Screenshot
              </button>
              <button
                id="btn-close-preview-modal"
                type="button"
                onClick={handleClosePreview}
                className="btn-secondary py-2 px-4 text-xs font-semibold"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Phase 8: Windows Background & Tray Preferences Modal ── */}
      {showSettingsModal && (
        <div id="background-settings-modal" className="fixed inset-0 z-50 bg-surface-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm glass-card p-5 space-y-4 animate-slide-up border-brand-500/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-brand-400" />
                <h3 className="text-sm font-bold text-white">Background & Tray Preferences</h3>
              </div>
              <button
                id="btn-close-settings-modal-x"
                onClick={() => setShowSettingsModal(false)}
                className="text-white/40 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-white/60 leading-relaxed">
              Configure how WorkTrack Pro runs on Windows. Background execution and auto-launch only activate with your explicit opt-in consent.
            </p>

            <div className="space-y-3 pt-1 text-xs">
              <label className="p-3 rounded-xl bg-surface-900 border border-white/5 flex items-start gap-3 cursor-pointer hover:border-brand-500/30 transition-all">
                <input
                  id="chk-minimize-to-tray"
                  type="checkbox"
                  checked={backgroundSettings.minimizeToTrayOnClose}
                  onChange={e => handleToggleMinimizeToTray(e.target.checked)}
                  className="mt-0.5 rounded border-white/20 bg-surface-800 text-brand-500 focus:ring-brand-500"
                />
                <div className="space-y-0.5">
                  <p className="font-semibold text-white">Minimize to System Tray on window close</p>
                  <p className="text-[10px] text-white/50 leading-relaxed">
                    When enabled, clicking [X] hides the window into the system tray so scheduled work sessions continue uninterrupted. When disabled, closing exits the app.
                  </p>
                </div>
              </label>

              <label className="p-3 rounded-xl bg-surface-900 border border-white/5 flex items-start gap-3 cursor-pointer hover:border-brand-500/30 transition-all">
                <input
                  id="chk-launch-on-startup"
                  type="checkbox"
                  checked={backgroundSettings.launchOnStartup}
                  onChange={e => handleToggleLaunchOnStartup(e.target.checked)}
                  className="mt-0.5 rounded border-white/20 bg-surface-800 text-brand-500 focus:ring-brand-500"
                />
                <div className="space-y-0.5">
                  <p className="font-semibold text-white">Launch WorkTrack Pro on Windows login</p>
                  <p className="text-[10px] text-white/50 leading-relaxed">
                    Automatically starts WorkTrack Pro when you sign in to your PC using official Windows login item APIs.
                  </p>
                </div>
              </label>
            </div>

            <div className="pt-2">
              <button
                id="btn-close-settings-modal"
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="btn-primary w-full py-2 text-xs font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

