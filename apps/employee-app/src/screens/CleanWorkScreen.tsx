import { useState, useEffect, useRef } from 'react'
import {
  Play,
  Square,
  Coffee,
  LogOut,
  Monitor,
  Clock,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Laptop,
  Check,
  X,
  Sparkles,
  Camera,
  Bell,
  Sliders,
} from 'lucide-react'
import type { WorkSession, BreakReason, DeviceRegistrationRecord } from '@worktrack-pro/shared'
import { sessionService } from '../services/sessionService'
import { deviceService } from '../services/deviceService'
import { screenshotService } from '../services/screenshotService'
import { presenceService } from '../services/presenceService'
import { employeeAuthService } from '../services/firebaseAuth'
import { scheduleService } from '../services/scheduleService'
import WindowControls from '../components/WindowControls'

interface CleanWorkScreenProps {
  employeeId: string
  employeeName: string
  department?: string
  deviceId: string
  deviceName: string
  onLogout: () => void
}

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function formatHoursMinutes(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0m'
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export default function CleanWorkScreen({
  employeeId,
  employeeName,
  department = 'General',
  deviceId,
  deviceName,
  onLogout,
}: CleanWorkScreenProps) {
  const [session, setSession] = useState<WorkSession | null>(null)
  const [deviceRecord, setDeviceRecord] = useState<DeviceRegistrationRecord | null>(null)
  const [workSeconds, setWorkSeconds] = useState(0)
  const [todaySeconds, setTodaySeconds] = useState(0)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [capturingNow, setCapturingNow] = useState(false)
  const [showBreakModal, setShowBreakModal] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const isAutoEndingRef = useRef(false)

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3500)
  }

  // Initial load: Active session & device status
  useEffect(() => {
    let isMounted = true

    async function loadData() {
      try {
        let [active, reg, history] = await Promise.all([
          sessionService.getActiveSession(),
          deviceService.getRegistrationRecord(),
          sessionService.getHistory(),
        ])

        if (!isMounted) return

        // Discard stale active session if it belongs to a different employee
        if (active && active.employeeId && active.employeeId !== employeeId) {
          console.warn(`[CleanWorkScreen] Discarding stale session from different employee (${active.employeeId} vs current ${employeeId})`)
          await sessionService.clearActiveSession()
          active = null
        }

        if (active) {
          if (active.deviceId !== deviceId) {
            console.log(`[CleanWorkScreen] Auto-repairing active session deviceId: ${active.deviceId} -> ${deviceId}`)
            active.deviceId = deviceId
            await sessionService.saveActiveSession(active).catch(() => {})
          }
          setSession(active)
          // Electron's background scheduler can create the local session while
          // the renderer is asleep. Re-sync it when the UI resumes so Admin
          // and screenshot uploads can see the same active session.
          await sessionService.syncSessionToFirestore(active).catch(() => false)
          // Ensure auto screenshot capture runs if session is active with latest cloud interval
          if (active.status === 'working') {
            await screenshotService.fetchCloudSettings().catch(() => {})
            screenshotService.startAutoCapture({
              deviceId,
              sessionId: active.id,
              employeeId,
              employeeName,
            })
          }
          showToast(`✓ Session automatically resumed. Tracking active until ${scheduleService.getFormattedEndTime()}.`)
        } else {
          // If no active session yet, evaluate whether to auto-start session during working hours (09:30 - 18:30)
          try {
            const schedRes = await scheduleService.evaluateSchedule()
            if (isMounted && schedRes.action === 'started' && schedRes.session) {
              setSession(schedRes.session)
              await screenshotService.fetchCloudSettings().catch(() => {})
              screenshotService.startAutoCapture({
                deviceId,
                sessionId: schedRes.session.id,
                employeeId,
                employeeName,
              })
              showToast(`✓ Work session auto-started at ${scheduleService.getFormattedStartTime()}. Monitoring active.`)
            }
          } catch (err) {
            console.warn('[CleanWorkScreen] Auto-start schedule check warning:', err)
          }
        }
        setDeviceRecord(reg)

        // Ensure active presence heartbeat is running for live online status
        const authUid = employeeAuthService.getAuthUid()
        if (authUid && !presenceService.isHeartbeatActive()) {
          presenceService.startHeartbeat({
            authUid,
            employeeId,
            deviceId,
          })
        }

        // Calculate today's total work time
        const todayStr = new Date().toDateString()
        const todayCompleted = history.filter((s: WorkSession) => {
          const sDate = s.startedAt instanceof Date ? s.startedAt : new Date(s.startedAt)
          return sDate.toDateString() === todayStr
        })
        const sumSeconds = todayCompleted.reduce((acc: number, s: WorkSession) => acc + (s.workDurationSeconds || s.durationSeconds || 0), 0)
        setTodaySeconds(sumSeconds)

        // Fetch and apply latest schedule from cloud silently in background
        scheduleService.fetchCloudSchedule().catch(() => {})
      } catch (err) {
        console.warn('[CleanWorkScreen] Initial load warning:', err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadData()

    // Start background schedule loop (evaluates every 15s to auto-start at 09:30 or auto-end at 18:30)
    scheduleService.startBackgroundLoop(15000)

    // Keep a locally-running session mirrored in Firestore. This also retries
    // when Firebase auth finishes initializing after the first screen load.
    const syncActiveSession = async () => {
      try {
        const active = await sessionService.getActiveSession()
        if (active && (active.status === 'working' || active.status === 'on_break')) {
          await sessionService.syncSessionToFirestore(active)
        }
      } catch (err) {
        console.warn('[CleanWorkScreen] Active session cloud sync retry failed:', err)
      }
    }
    const syncTimer = setInterval(syncActiveSession, 15000)
    syncActiveSession()

    // Listen to real-time device approval updates from Admin
    const unsubDevice = deviceService.subscribeToDeviceApproval(deviceId, updated => {
      if (isMounted) {
        setDeviceRecord(updated)
        if (updated.status === 'approved') {
          showToast('✓ Device registration approved by Admin!')
        }
      }
    })

    // Listen to real-time screenshot interval & settings updates from Admin Console
    const unsubSettings = screenshotService.subscribeToCloudSettings()

    // Listen to real-time cloud schedule updates (/settings/global)
    const unsubSchedule = scheduleService.subscribeToCloudSchedule()

    // Listen to Electron background schedule events
    const api = typeof window !== 'undefined' ? (window as any).electronAPI : null
    let unlistenIpc: (() => void) | null = null
    if (api?.on) {
          unlistenIpc = api.on('session:scheduleUpdated', async (data: any) => {
        if (data?.action === 'ended') {
          screenshotService.stopAutoCapture()
          sessionService.getActiveSession().then(act => {
            if (isMounted) {
              setSession(act)
              if (!act) {
                setWorkSeconds(0)
                showToast('🔔 Shift completed. Session automatically ended.')
              }
            }
          })
        } else if (data?.action === 'started' && data?.session) {
          sessionService.getActiveSession().then(async act => {
            const current = act || data.session
            await sessionService.syncSessionToFirestore(current).catch(() => false)
            if (isMounted) {
              setSession(current)
              screenshotService.startAutoCapture({
                deviceId,
                sessionId: current.id,
                employeeId,
                employeeName,
              })
              showToast('✓ Shift automatically started. Activity tracking active.')
            }
          })
        }
      })
    }

    return () => {
      isMounted = false
      clearInterval(syncTimer)
      scheduleService.stopBackgroundLoop()
      unsubDevice()
      unsubSettings()
      unsubSchedule()
      if (unlistenIpc) unlistenIpc()
    }
  }, [deviceId, employeeId, employeeName])

  // Automatic Session End handler when Shift End Time is reached
  const handleAutoEndSession = async () => {
    try {
      screenshotService.stopAutoCapture()
      const endBoundary = scheduleService.getScheduledEndBoundary()
      const endDisplay = scheduleService.getFormattedEndTime()

      const completed = await sessionService.endWork({
        timestamp: endBoundary,
        notes: `Shift completed. Auto-ended at scheduled end time (${endDisplay}).`,
      })

      setTodaySeconds(prev => prev + (completed.workDurationSeconds || completed.durationSeconds || workSeconds))
      setSession(null)
      setWorkSeconds(0)
      showToast(`🔔 Shift End Time (${endDisplay}) reached! Session automatically completed & saved to cloud.`)

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('WorkTrack Pro - Shift Ended', {
          body: `Your scheduled shift has completed at ${endDisplay}. Work session ended automatically.`,
        })
      }
    } catch (err: any) {
      console.warn('[CleanWorkScreen] Automatic session end warning:', err)
    } finally {
      setTimeout(() => {
        isAutoEndingRef.current = false
      }, 5000)
    }
  }

  // Live timer tick & automatic end-of-shift detection
  useEffect(() => {
    const timer = setInterval(() => {
      if (!session) {
        setWorkSeconds(0)
        return
      }

      // Check if session has reached or passed scheduled End Time
      if (session.status === 'working' || session.status === 'on_break') {
        const isPastEnd = scheduleService.isPastScheduledEnd()
        if (isPastEnd && !isAutoEndingRef.current) {
          isAutoEndingRef.current = true
          handleAutoEndSession()
          return
        }
      }

      const now = Date.now()
      const startMs = session.startedAt instanceof Date ? session.startedAt.getTime() : new Date(session.startedAt).getTime()

      if (session.status === 'working') {
        const totalElapsed = Math.max(0, Math.floor((now - startMs) / 1000))
        const breakTotal = (session.breaks || []).reduce((acc, b) => {
          if (b.durationSeconds) return acc + b.durationSeconds
          if (b.startedAt && b.endedAt) {
            const bStart = b.startedAt instanceof Date ? b.startedAt.getTime() : new Date(b.startedAt).getTime()
            const bEnd = b.endedAt instanceof Date ? b.endedAt.getTime() : new Date(b.endedAt).getTime()
            return acc + Math.max(0, Math.floor((bEnd - bStart) / 1000))
          }
          return acc
        }, 0)
        setWorkSeconds(Math.max(0, totalElapsed - breakTotal))
      } else if (session.status === 'on_break') {
        setWorkSeconds(session.workDurationSeconds || 0)
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [session])

  // Actions: Start Work
  const handleStartWork = async () => {
    setActionLoading(true)
    try {
      const newSession = await sessionService.startWork({
        deviceId,
        employeeId,
      })
      setSession(newSession)
      screenshotService.startAutoCapture({
        deviceId,
        sessionId: newSession.id,
        employeeId,
        employeeName,
      })
      showToast('✓ Work session started. Activity tracking active.')
    } catch (err: any) {
      alert(err?.message || 'Failed to start session.')
    } finally {
      setActionLoading(false)
    }
  }

  // Actions: Start Break
  const handleStartBreak = async (reason: BreakReason = 'coffee') => {
    setActionLoading(true)
    setShowBreakModal(false)
    try {
      screenshotService.stopAutoCapture()
      const updated = await sessionService.startBreak(reason)
      setSession(updated)
      showToast('⏸ On break. Screenshot capture paused.')
    } catch (err: any) {
      alert(err?.message || 'Failed to pause session.')
    } finally {
      setActionLoading(false)
    }
  }

  // Actions: Resume Work
  const handleResumeWork = async () => {
    setActionLoading(true)
    try {
      const updated = await sessionService.resumeWork()
      setSession(updated)
      if (updated) {
        screenshotService.startAutoCapture({
          deviceId,
          sessionId: updated.id,
          employeeId,
          employeeName,
        })
      }
      showToast('✓ Resumed work. Activity tracking restarted.')
    } catch (err: any) {
      alert(err?.message || 'Failed to resume session.')
    } finally {
      setActionLoading(false)
    }
  }

  // Actions: End Work Session
  const handleEndWork = async () => {
    if (!window.confirm('Are you sure you want to complete and end your work session?')) {
      return
    }

    setActionLoading(true)
    try {
      screenshotService.stopAutoCapture()
      const completed = await sessionService.endWork()
      setTodaySeconds(prev => prev + (completed.workDurationSeconds || completed.durationSeconds || workSeconds))
      setSession(null)
      setWorkSeconds(0)
      showToast('✓ Session ended and synchronized to cloud.')
    } catch (err: any) {
      alert(err?.message || 'Failed to end session.')
    } finally {
      setActionLoading(false)
    }
  }

  // Actions: Manual Instant Capture
  const handleCaptureNow = async () => {
    if (!session || session.status !== 'working') {
      showToast('⚠️ Please start a work session first.')
      return
    }

    setCapturingNow(true)
    try {
      const res = await screenshotService.captureScreenshot({
        deviceId,
        sessionId: session.id,
        employeeId,
        interactive: true,
      })

      if (res.success && res.data && res.data.dataUrl) {
        const uploadRes = await screenshotService.uploadScreenshotToCloud(
          { ...res.data, employeeName } as any,
          res.data.dataUrl
        )

        if (uploadRes.success) {
          showToast('📸 Screenshot captured & synced to Admin Portal!')
        } else {
          showToast(`📸 ${uploadRes.error || 'Screenshot captured and queued for sync.'}`)
        }
      } else {
        showToast(res.error || 'Failed to capture screenshot.')
      }
    } catch (err: any) {
      showToast('Capture error: ' + (err?.message || 'Failed'))
    } finally {
      setCapturingNow(false)
    }
  }

  const isApproved = deviceRecord?.status === 'approved'

  if (loading) {
    return (
      <div className="h-screen w-screen bg-[#080f0e] flex flex-col items-center justify-center text-white select-none">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mb-3" />
        <p className="text-xs text-white/50 font-mono">Connecting to Workspace...</p>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen bg-[#080f0e] text-white flex flex-col select-none overflow-hidden font-sans">
      {/* ─── Top Titlebar & User Bar ─── */}
      <div className="drag-region flex items-center justify-between px-4 py-3 bg-[#0d1715] border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Monitor className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-tight text-white">WorkTrack Pro</span>
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-semibold border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            </div>
            <p className="text-[10px] text-white/40">{deviceName}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 no-drag">
          {/* Employee Avatar Badge */}
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-white/5 border border-white/10">
            <div className="w-6 h-6 rounded-lg bg-emerald-600/30 text-emerald-300 flex items-center justify-center text-[10px] font-bold">
              {employeeName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div className="text-left">
              <p className="text-xs font-medium text-white leading-tight">{employeeName}</p>
              <p className="text-[9px] text-white/40 font-mono leading-tight">{employeeId}</p>
            </div>
          </div>

          {/* Sign Out Button */}
          <button
            onClick={onLogout}
            title="Sign Out"
            className="p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>

          <WindowControls />
        </div>
      </div>

      {/* ─── Toast Feedback ─── */}
      {toastMessage && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-medium shadow-xl backdrop-blur-md animate-fade-in flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ─── Main Content ─── */}
      <div className="flex-1 flex flex-col justify-between p-6 overflow-y-auto">
        {/* Device Approval Warning Banner if Pending */}
        {!isApproved && (
          <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2.5 animate-slide-up">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <div className="flex-1">
              <span className="font-semibold text-amber-300">Device Awaiting IT Approval: </span>
              Your hardware ID is registered. Sessions will sync locally and push to cloud automatically once approved.
            </div>
          </div>
        )}

        {/* ─── Hero Section: Digital Timer & State ─── */}
        <div className="my-auto text-center space-y-5">
          {/* Status Capsule */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold border backdrop-blur-md transition-all shadow-lg">
            {session?.status === 'working' ? (
              <div className="flex items-center gap-2 text-emerald-400 border-emerald-500/30 bg-emerald-500/15 px-3 py-1 rounded-full">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Tracking in Progress</span>
              </div>
            ) : session?.status === 'on_break' ? (
              <div className="flex items-center gap-2 text-amber-400 border-amber-500/30 bg-amber-500/15 px-3 py-1 rounded-full">
                <Coffee className="w-3.5 h-3.5 text-amber-400" />
                <span>On Break (Paused)</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-white/50 border-white/10 bg-white/5 px-3 py-1 rounded-full">
                <span className="w-2 h-2 rounded-full bg-white/40" />
                <span>Ready to Work</span>
              </div>
            )}
          </div>

          {/* Big Digital Clock */}
          <div className="relative">
            <div className="text-6xl sm:text-7xl font-extrabold tracking-tight font-mono text-white drop-shadow-[0_0_25px_rgba(16,185,129,0.25)]">
              {formatTime(workSeconds)}
            </div>
            <p className="text-xs text-white/40 font-medium uppercase tracking-widest mt-2">
              Current Session Time
            </p>
          </div>

          {/* Action Control Buttons */}
          <div className="flex items-center justify-center gap-3 pt-2">
            {!session || session.status === 'ended' ? (
              <button
                onClick={handleStartWork}
                disabled={actionLoading}
                className="flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-[0_0_25px_rgba(16,185,129,0.4)] hover:shadow-[0_0_35px_rgba(16,185,129,0.6)] active:scale-95 transition-all disabled:opacity-50"
              >
                {actionLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-current" />
                    <span>Start Working</span>
                  </>
                )}
              </button>
            ) : session.status === 'working' ? (
              <>
                <button
                  onClick={handleCaptureNow}
                  disabled={capturingNow || actionLoading}
                  className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white border border-white/20 text-xs font-semibold active:scale-95 transition-all shadow-md"
                  title="Capture screenshot immediately to Admin Panel"
                >
                  {capturingNow ? (
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  ) : (
                    <Camera className="w-4 h-4 text-emerald-400" />
                  )}
                  <span>Capture Now</span>
                </button>

                <button
                  onClick={() => setShowBreakModal(true)}
                  disabled={actionLoading}
                  className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold active:scale-95 transition-all"
                >
                  <Coffee className="w-4 h-4" />
                  <span>Take Break</span>
                </button>
              </>
            ) : (
              // On Break
              <>
                <button
                  onClick={handleResumeWork}
                  disabled={actionLoading}
                  className="flex items-center justify-center gap-2 px-8 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Resume Work</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* ─── 3 Clean Stat Cards ─── */}
        <div className="grid grid-cols-3 gap-3 pt-6">
          {/* Card 1: Device Status */}
          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/5 flex flex-col items-center justify-center text-center">
            <Laptop className="w-4 h-4 text-white/40 mb-1.5" />
            <span className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Device</span>
            <div className="mt-1">
              {isApproved ? (
                <span className="text-xs font-semibold text-emerald-400 flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Approved
                </span>
              ) : (
                <span className="text-xs font-semibold text-amber-400">Pending</span>
              )}
            </div>
          </div>

          {/* Card 2: Today's Work Total */}
          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/5 flex flex-col items-center justify-center text-center">
            <Clock className="w-4 h-4 text-emerald-400 mb-1.5" />
            <span className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Today's Total</span>
            <span className="text-sm font-bold text-white font-mono mt-1">
              {formatHoursMinutes(todaySeconds + workSeconds)}
            </span>
          </div>

          {/* Card 3: Screen Capture Monitoring */}
          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/5 flex flex-col items-center justify-center text-center">
            <Shield className="w-4 h-4 text-brand-400 mb-1.5" />
            <span className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Capture</span>
            <span className="text-xs font-semibold text-emerald-400 mt-1">
              {session?.status === 'working' ? 'Active' : 'Standby'}
            </span>
          </div>
        </div>

        {/* ─── Bottom Privacy & Policy Notice ─── */}
        <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-white/30">
          <div className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-emerald-400/60" />
            <span>Automated screenshot capture active during work sessions</span>
          </div>
          <span className="font-mono text-[10px]">{department}</span>
        </div>
      </div>

      {/* ─── Break Selection Modal ─── */}
      {showBreakModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-xs bg-[#11201d] border border-white/10 rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Coffee className="w-4 h-4 text-amber-400" />
                Select Break Reason
              </h3>
              <button
                onClick={() => setShowBreakModal(false)}
                className="text-white/40 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleStartBreak('coffee')}
                className="p-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-all active:scale-95 group"
              >
                <span className="text-2xl block mb-1.5">☕</span>
                <span className="text-xs font-semibold text-white block group-hover:text-amber-300 transition-colors">Tea Break</span>
                <span className="text-[11px] text-amber-400 font-mono">10 mins</span>
              </button>

              <button
                onClick={() => handleStartBreak('lunch')}
                className="p-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-all active:scale-95 group"
              >
                <span className="text-2xl block mb-1.5">🥪</span>
                <span className="text-xs font-semibold text-white block group-hover:text-emerald-300 transition-colors">Lunch Break</span>
                <span className="text-[11px] text-emerald-400 font-mono">45 mins</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
