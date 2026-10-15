import { useState, useEffect } from 'react'
import {
  Play, Square, Camera, Monitor, Wifi, WifiOff,
  Eye, EyeOff, Clock, Shield, LogOut, AlertTriangle,
  CheckCircle, X, Loader2, Coffee, Bell, ChevronDown,
  ChevronUp, Lock, Laptop, ArrowDownToLine, RefreshCw,
  Sparkles, Check, Info, Globe
} from 'lucide-react'
import type { DeviceIdentity } from '../App'
import WindowControls from '../components/WindowControls'

interface Props {
  identity: DeviceIdentity
  onLogout: () => void
}

type SessionState = 'idle' | 'starting' | 'active' | 'break' | 'ending'
type ConnectionState = 'connected' | 'connecting' | 'disconnected'
type ShareState = 'none' | 'requested' | 'approved' | 'active' | 'stopping'
type CaptureState = 'off' | 'on'
type BreakReason = 'lunch' | 'coffee' | 'meeting' | 'personal'

interface ShareRequest {
  requestId: string
  adminName: string
  requestedAt: Date
}

interface ActivityEvent {
  id: string
  time: string
  icon: 'camera' | 'code' | 'break' | 'start' | 'idle'
  title: string
  detail: string
}

const BREAK_OPTIONS: { id: BreakReason; label: string; icon: string; defaultMinutes: number }[] = [
  { id: 'coffee', label: 'Coffee / Tea', icon: '☕', defaultMinutes: 15 },
  { id: 'lunch', label: 'Lunch Break', icon: '🥪', defaultMinutes: 45 },
  { id: 'meeting', label: 'Offline Meeting', icon: '👥', defaultMinutes: 30 },
  { id: 'personal', label: 'Personal Errands', icon: '🌿', defaultMinutes: 10 },
]

export default function WorkScreen({ identity, onLogout }: Props) {
  const [session, setSession] = useState<SessionState>('idle')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionStart, setSessionStart] = useState<Date | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const [captureState, setCaptureState] = useState<CaptureState>('on')
  const [shareState, setShareState] = useState<ShareState>('none')
  const [pendingRequest, setPendingRequest] = useState<ShareRequest | null>(null)
  const [activeBreak, setActiveBreak] = useState<BreakReason | null>(null)
  const [breakElapsed, setBreakElapsed] = useState(0)
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)
  const [showTrayNotice, setShowTrayNotice] = useState(false)
  const [toastNotification, setToastNotification] = useState<string | null>(null)
  const [showBreakSelector, setShowBreakSelector] = useState(false)

  // Recent timeline events
  const [activityFeed, setActivityFeed] = useState<ActivityEvent[]>([
    {
      id: 'act_0',
      time: '09:00 AM',
      icon: 'start',
      title: 'Agent Synchronized',
      detail: `Authenticated with ${identity.deviceName}`,
    },
    {
      id: 'act_1',
      time: '09:32 AM',
      icon: 'code',
      title: 'Active in Development Suite',
      detail: 'VS Code & Git Terminal',
    },
    {
      id: 'act_2',
      time: '10:15 AM',
      icon: 'camera',
      title: 'Scheduled Screenshot',
      detail: 'Encrypted locally with AES-256',
    },
  ])

  // Connection simulation
  useEffect(() => {
    const t1 = setTimeout(() => setConnection('connected'), 1200)
    return () => clearTimeout(t1)
  }, [])

  // Timer loop
  useEffect(() => {
    if (session === 'active' && sessionStart) {
      const interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - sessionStart.getTime()) / 1000))
      }, 1000)
      return () => clearInterval(interval)
    } else if (session === 'break') {
      const interval = setInterval(() => {
        setBreakElapsed(prev => prev + 1)
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [session, sessionStart])

  // Periodic simulated screenshot notification
  useEffect(() => {
    if (session !== 'active' || captureState !== 'on') return
    const interval = setInterval(() => {
      showToast('📸 Screenshot captured & encrypted')
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      setActivityFeed(prev => [
        {
          id: `act_${Date.now()}`,
          time: nowStr,
          icon: 'camera',
          title: 'Periodic Capture Logged',
          detail: 'Uploaded metadata to admin audit log',
        },
        ...prev.slice(0, 9),
      ])
    }, 45000) // demo every 45s
    return () => clearInterval(interval)
  }, [session, captureState])

  const showToast = (message: string) => {
    setToastNotification(message)
    setTimeout(() => {
      setToastNotification(null)
    }, 4000)
  }

  const startSession = async () => {
    setSession('starting')
    const api = (window as any).electronAPI
    let result: { success: boolean; data?: any }
    if (api) {
      result = await api.invoke('session:start', { deviceId: identity.deviceId })
    } else {
      await sleep(600)
      result = { success: true, data: { sessionId: `sess_${Date.now()}` } }
    }

    if (result.success) {
      setSessionId(result.data?.sessionId)
      setSessionStart(new Date())
      setSession('active')
      setCaptureState('on')
      showToast('🟢 Work Session Started — Monitoring Active')
      setActivityFeed(prev => [
        {
          id: `act_${Date.now()}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          icon: 'start',
          title: 'Work Session Started',
          detail: 'Tracking enabled per company schedule',
        },
        ...prev,
      ])
    } else {
      setSession('idle')
    }
  }

  const endSession = async () => {
    if (shareState === 'active') await stopSharing()
    setSession('ending')
    const api = (window as any).electronAPI
    if (api && sessionId) {
      await api.invoke('session:end', { sessionId })
    } else {
      await sleep(400)
    }
    setSession('idle')
    setSessionId(null)
    setSessionStart(null)
    setActiveBreak(null)
    showToast('🛑 Work Session Ended — Tracking Stopped')
  }

  const startBreak = (reason: BreakReason) => {
    setActiveBreak(reason)
    setSession('break')
    setShowBreakSelector(false)
    setBreakElapsed(0)
    const opt = BREAK_OPTIONS.find(b => b.id === reason)
    showToast(`☕ Break Started: ${opt?.label}`)
    setActivityFeed(prev => [
      {
        id: `act_${Date.now()}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        icon: 'break',
        title: `Break: ${opt?.label}`,
        detail: 'Screenshots & activity monitoring paused',
      },
      ...prev,
    ])
  }

  const endBreak = () => {
    setSession('active')
    setActiveBreak(null)
    showToast('▶ Break Ended — Resumed Active Session')
  }

  const approveShare = async () => {
    if (!pendingRequest) return
    const api = (window as any).electronAPI
    if (api) {
      await api.invoke('share:approve', { requestId: pendingRequest.requestId })
    }
    setShareState('active')
    showToast('👁 Screen Share Approved — Admin is now viewing')
  }

  const denyShare = async () => {
    if (!pendingRequest) return
    const api = (window as any).electronAPI
    if (api) {
      await api.invoke('share:deny', { requestId: pendingRequest.requestId })
    }
    setPendingRequest(null)
    setShareState('none')
    showToast('🔒 Screen Share Request Denied')
  }

  const stopSharing = async () => {
    setShareState('stopping')
    const api = (window as any).electronAPI
    if (api) await api.invoke('share:stop', {})
    await sleep(400)
    setPendingRequest(null)
    setShareState('none')
    showToast('Screen Share Stopped')
  }

  const formatSeconds = (s: number) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  const isSessionActive = session === 'active'
  const isOnBreak = session === 'break'

  return (
    <div className="h-full flex flex-col bg-surface-950 text-white overflow-hidden select-none">
      {/* ── Native Frameless Titlebar ───────────────────────── */}
      <div className="h-11 border-b border-white/5 bg-surface-900/90 backdrop-blur flex items-center px-3.5 titlebar-drag flex-shrink-0">
        <div className="flex items-center gap-2 titlebar-no-drag w-full">
          <div className="w-5 h-5 rounded-lg bg-brand-600/30 border border-brand-500/30 flex items-center justify-center">
            <Shield className="w-3 h-3 text-brand-400" />
          </div>
          <span className="text-xs font-bold text-white tracking-wide">WorkTrack Pro</span>
          <span className="text-[10px] text-brand-400 font-medium px-1.5 py-0.2 rounded bg-brand-500/10 border border-brand-500/20">
            Agent
          </span>

          <div className="ml-auto flex items-center gap-2">
            {/* Connection badge */}
            {connection === 'connected' ? (
              <span className="flex items-center gap-1 text-[11px] text-success-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-success-400 animate-pulse" />
                Online
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] text-warning-400 font-medium">
                <Loader2 className="w-3 h-3 animate-spin" />
                Connecting
              </span>
            )}
            <div className="h-3 w-px bg-white/10 mx-1" />
            <WindowControls />
          </div>
        </div>
      </div>

      {/* ── Toast Notification Simulator ────────────────────── */}
      {toastNotification && (
        <div className="absolute top-14 left-4 right-4 z-50 animate-slide-up">
          <div className="bg-surface-800/95 border border-brand-500/40 shadow-glow-green/30 backdrop-blur-md rounded-xl p-3 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <Bell className="w-4 h-4 text-brand-400 animate-bounce" />
              <span className="font-medium text-white">{toastNotification}</span>
            </div>
            <button onClick={() => setToastNotification(null)} className="text-white/40 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Main Scrollable View ────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Status & Timer Card */}
        <div className="glass-card p-5 relative overflow-hidden border-brand-500/20 shadow-glow-green/10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  isSessionActive
                    ? 'bg-success-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]'
                    : isOnBreak
                    ? 'bg-warning-400 shadow-[0_0_8px_rgba(250,204,21,0.8)]'
                    : 'bg-white/20'
                }`}
              />
              <span className="text-xs font-bold uppercase tracking-wider text-white/70">
                {isSessionActive ? 'Active Session' : isOnBreak ? `On Break (${activeBreak})` : 'Offline / Inactive'}
              </span>
            </div>

            <button
              onClick={() => setShowPrivacyModal(true)}
              className="text-[11px] text-brand-400 hover:text-brand-300 flex items-center gap-1 font-medium underline"
            >
              <Lock className="w-3 h-3" />
              Privacy Notice
            </button>
          </div>

          {/* Session Timer Display */}
          <div className="text-center py-2">
            <p className="text-4xl font-mono font-bold tracking-widest text-white drop-shadow-sm">
              {isOnBreak ? formatSeconds(breakElapsed) : formatSeconds(elapsed)}
            </p>
            <p className="text-[11px] text-white/40 mt-1 font-mono uppercase tracking-wider">
              {isOnBreak ? 'Break Elapsed Time' : 'Elapsed Working Duration'}
            </p>
          </div>

          {/* Primary Action Buttons */}
          <div className="mt-4 pt-3 border-t border-white/5 space-y-2">
            {!isSessionActive && !isOnBreak ? (
              <button
                id="start-work-btn"
                onClick={startSession}
                disabled={session === 'starting'}
                className="btn-primary w-full py-3 text-sm font-semibold shadow-glow-green"
              >
                {session === 'starting' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Initializing Agent...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    Start Work Session
                  </>
                )}
              </button>
            ) : isOnBreak ? (
              <button
                id="resume-work-btn"
                onClick={endBreak}
                className="btn-primary w-full py-2.5 text-sm font-semibold bg-brand-600 hover:bg-brand-500"
              >
                <Play className="w-4 h-4 fill-white" />
                Resume Working Session
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  id="take-break-btn"
                  onClick={() => setShowBreakSelector(prev => !prev)}
                  className="btn-secondary py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <Coffee className="w-3.5 h-3.5 text-warning-400" />
                  Take Break
                </button>
                <button
                  id="end-session-btn"
                  onClick={endSession}
                  className="btn-danger py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <Square className="w-3.5 h-3.5 fill-white" />
                  Clock Out / End
                </button>
              </div>
            )}

            {/* Break Selector Dropdown */}
            {showBreakSelector && (
              <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-surface-900 border border-white/10 animate-slide-up">
                {BREAK_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => startBreak(opt.id)}
                    className="p-2 rounded-lg bg-surface-800 hover:bg-surface-700 text-left transition-colors flex items-center gap-2"
                  >
                    <span className="text-sm">{opt.icon}</span>
                    <div>
                      <p className="text-xs font-semibold text-white">{opt.label}</p>
                      <p className="text-[10px] text-white/40">{opt.defaultMinutes}m standard</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Live Monitoring Indicators Strip */}
        <div className="glass-card p-3.5 space-y-2.5">
          <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
            Live Monitoring Status
          </p>

          <div className="grid grid-cols-3 gap-2">
            {/* Screenshot status */}
            <div className={`p-2.5 rounded-xl border flex flex-col justify-between ${
              isSessionActive && captureState === 'on'
                ? 'bg-brand-500/10 border-brand-500/25 text-brand-300'
                : 'bg-surface-800/40 border-white/5 text-white/30'
            }`}>
              <div className="flex items-center justify-between">
                <Camera className="w-3.5 h-3.5" />
                <span className={`w-1.5 h-1.5 rounded-full ${isSessionActive ? 'bg-success-400' : 'bg-white/20'}`} />
              </div>
              <div className="mt-2">
                <p className="text-[11px] font-bold leading-tight">Screenshots</p>
                <p className="text-[9px] opacity-60">Every 120s</p>
              </div>
            </div>

            {/* Activity tracking */}
            <div className={`p-2.5 rounded-xl border flex flex-col justify-between ${
              isSessionActive
                ? 'bg-brand-500/10 border-brand-500/25 text-brand-300'
                : 'bg-surface-800/40 border-white/5 text-white/30'
            }`}>
              <div className="flex items-center justify-between">
                <Clock className="w-3.5 h-3.5" />
                <span className={`w-1.5 h-1.5 rounded-full ${isSessionActive ? 'bg-success-400' : 'bg-white/20'}`} />
              </div>
              <div className="mt-2">
                <p className="text-[11px] font-bold leading-tight">Activity Log</p>
                <p className="text-[9px] opacity-60">Active / Idle</p>
              </div>
            </div>

            {/* App tracking */}
            <div className={`p-2.5 rounded-xl border flex flex-col justify-between ${
              isSessionActive
                ? 'bg-brand-500/10 border-brand-500/25 text-brand-300'
                : 'bg-surface-800/40 border-white/5 text-white/30'
            }`}>
              <div className="flex items-center justify-between">
                <Monitor className="w-3.5 h-3.5" />
                <span className={`w-1.5 h-1.5 rounded-full ${isSessionActive ? 'bg-success-400' : 'bg-white/20'}`} />
              </div>
              <div className="mt-2">
                <p className="text-[11px] font-bold leading-tight">App Usage</p>
                <p className="text-[9px] opacity-60">Window Titles</p>
              </div>
            </div>
          </div>
        </div>

        {/* Today's Productivity Summary */}
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
              Today's Work Summary
            </span>
            <span className="text-xs font-bold text-success-400">96% Productive</span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2.5 rounded-xl bg-surface-800/50 border border-white/5">
              <p className="text-base font-mono font-bold text-white">5h 24m</p>
              <p className="text-[10px] text-white/40 mt-0.5">Total Hours</p>
            </div>
            <div className="p-2.5 rounded-xl bg-surface-800/50 border border-white/5">
              <p className="text-base font-mono font-bold text-brand-400">4h 52m</p>
              <p className="text-[10px] text-white/40 mt-0.5">Active Time</p>
            </div>
            <div className="p-2.5 rounded-xl bg-surface-800/50 border border-white/5">
              <p className="text-base font-mono font-bold text-warning-400">32m</p>
              <p className="text-[10px] text-white/40 mt-0.5">Idle / Break</p>
            </div>
          </div>
        </div>

        {/* Live Remote Share Banner if Active */}
        {shareState === 'active' && (
          <div className="glass-card p-4 border-danger-500/40 bg-danger-500/10 space-y-2 animate-slide-up">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-danger-400 animate-pulse" />
                <span className="text-xs font-bold text-danger-300">Live Screen Sharing Active</span>
              </div>
              <button
                onClick={stopSharing}
                className="btn-danger py-1 px-2.5 text-xs"
              >
                Stop Sharing
              </button>
            </div>
            <p className="text-[11px] text-white/60">
              Admin is currently observing your primary desktop. You can terminate this stream at any moment.
            </p>
          </div>
        )}

        {/* Recent Activity Timeline */}
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
              Recent Activity Feed
            </span>
            <button
              onClick={() => showToast('🔔 Notification simulated')}
              className="text-[10px] text-brand-400 hover:text-brand-300 underline"
            >
              Simulate Alert
            </button>
          </div>

          <div className="space-y-2.5">
            {activityFeed.slice(0, 4).map(item => (
              <div key={item.id} className="flex items-start gap-2.5 text-xs">
                <span className="text-[10px] font-mono text-white/30 mt-0.5 flex-shrink-0 w-14">
                  {item.time}
                </span>
                <div className="w-1.5 h-1.5 rounded-full bg-brand-400 mt-1.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white text-xs truncate">{item.title}</p>
                  <p className="text-[10px] text-white/40 truncate">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Device & Agent Metadata Footer */}
        <div className="p-3 rounded-xl bg-surface-900 border border-white/5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/40 font-mono text-[11px]">Machine:</span>
            <span className="text-white/80 font-mono text-[11px]">{identity.deviceName}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/40 font-mono text-[11px]">Employee ID:</span>
            <span className="text-white/80 font-mono text-[11px]">{identity.employeeId}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/40 font-mono text-[11px]">Sync Status:</span>
            <span className="text-success-400 font-mono text-[11px]">AES-256 / Encrypted</span>
          </div>
          <div className="pt-2 border-t border-white/5 flex items-center justify-between">
            <button
              onClick={() => setShowTrayNotice(prev => !prev)}
              className="text-[11px] text-white/40 hover:text-white flex items-center gap-1"
            >
              <ArrowDownToLine className="w-3 h-3" />
              {showTrayNotice ? 'Hide Tray Info' : 'Minimize to Tray'}
            </button>
            <button
              onClick={onLogout}
              disabled={isSessionActive}
              className="text-[11px] text-danger-400/80 hover:text-danger-400 flex items-center gap-1 disabled:opacity-30 disabled:hover:text-danger-400/80"
              title={isSessionActive ? 'End session before signing out' : 'Sign out device'}
            >
              <LogOut className="w-3 h-3" />
              Sign Out
            </button>
          </div>
          {showTrayNotice && (
            <p className="text-[10px] text-white/40 bg-surface-800 p-2 rounded-lg mt-1">
              💡 WorkTrack Pro can run minimized in the Windows System Tray. Click the tray icon to restore.
            </p>
          )}
        </div>
      </div>

      {/* ── Privacy Transparency Modal ──────────────────────── */}
      {showPrivacyModal && (
        <div className="fixed inset-0 z-50 bg-surface-950/90 backdrop-blur-sm flex items-center justify-center p-4">
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
                  <Check className="w-3.5 h-3.5" /> What Is Monitored:
                </p>
                <ul className="list-disc list-inside text-white/70 space-y-0.5 text-[11px]">
                  <li>Active work hours & session duration</li>
                  <li>Screenshots during active sessions only</li>
                  <li>Active application titles (e.g. VS Code, Slack)</li>
                  <li>Aggregate activity level (keyboard/mouse counts)</li>
                </ul>
              </div>

              <div className="p-3 rounded-xl bg-danger-500/10 border border-danger-500/20 space-y-1">
                <p className="font-semibold text-danger-400 flex items-center gap-1.5">
                  <X className="w-3.5 h-3.5" /> What Is NEVER Monitored:
                </p>
                <ul className="list-disc list-inside text-white/70 space-y-0.5 text-[11px]">
                  <li>Individual keystrokes, passwords, or credentials</li>
                  <li>Webcam video or microphone audio</li>
                  <li>Personal folders or private browser windows</li>
                  <li>Any activity while paused, on break, or offline</li>
                </ul>
              </div>
            </div>

            <button
              onClick={() => setShowPrivacyModal(false)}
              className="btn-primary w-full py-2 text-xs font-semibold"
            >
              I Understand
            </button>
          </div>
        </div>
      )}

      {/* ── Screen View Request Modal (Requires Explicit Approval) ── */}
      {shareState === 'requested' && pendingRequest && (
        <div className="fixed inset-0 z-50 bg-surface-950/90 backdrop-blur-sm flex items-end justify-center p-4">
          <div className="w-full max-w-sm glass-card p-5 space-y-4 animate-slide-up border-brand-500/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-600/20 flex items-center justify-center flex-shrink-0">
                <Eye className="w-5 h-5 text-brand-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Live Screen View Request</p>
                <p className="text-xs text-white/40">From {pendingRequest.adminName}</p>
              </div>
            </div>

            <p className="text-xs text-white/60 leading-relaxed">
              <strong className="text-white">{pendingRequest.adminName}</strong> is requesting to view your active screen. Per company policy, your explicit authorization is required.
            </p>

            <div className="flex gap-2">
              <button
                id="deny-share-btn"
                onClick={denyShare}
                className="btn-secondary flex-1 py-2 text-xs"
              >
                Deny
              </button>
              <button
                id="approve-share-btn"
                onClick={approveShare}
                className="btn-primary flex-1 py-2 text-xs bg-success-600 hover:bg-success-500 shadow-none"
              >
                Approve & Share
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}
