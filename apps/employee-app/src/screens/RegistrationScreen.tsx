import { useState, useEffect } from 'react'
import {
  Shield,
  Monitor,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Building2,
  User,
  KeyRound,
  RefreshCw,
  Sparkles,
  ArrowRight,
  RotateCcw,
  LogOut,
} from 'lucide-react'
import type { DeviceIdentity } from '../App'
import type { DeviceRegistrationRecord, DeviceRegistrationStatus, UserAccount } from '@worktrack-pro/shared'
import WindowControls from '../components/WindowControls'
import { deviceService, type DeviceInfo } from '../services/deviceService'

interface Props {
  onRegistered: (identity: DeviceIdentity) => void
  onLogout?: () => void
  authUser?: UserAccount | null
}

export default function RegistrationScreen({ onRegistered, onLogout, authUser }: Props) {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null)
  const [record, setRecord] = useState<DeviceRegistrationRecord | null>(null)
  const [loading, setLoading] = useState(true)

  // Form fields for registration
  const [employeeId, setEmployeeId] = useState('')
  const [employeeName, setEmployeeName] = useState('')
  const [department, setDepartment] = useState('Engineering')
  const [deviceName, setDeviceName] = useState('')

  // UI state
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Load device info & current registration on mount, listen for admin approval
  useEffect(() => {
    let unsub = () => {}
    loadData().then(info => {
      if (info?.deviceId) {
        unsub = deviceService.subscribeToDeviceApproval(info.deviceId, (updatedRecord) => {
          setRecord(updatedRecord)
        })
      }
    })
    return () => unsub()
  }, [])

  const loadData = async (): Promise<DeviceInfo | null> => {
    setLoading(true)
    setError(null)
    try {
      const [info, currentRecord] = await Promise.all([
        deviceService.getDeviceInfo(),
        deviceService.getRegistrationRecord(),
      ])
      setDeviceInfo(info)
      setRecord(currentRecord)
      setDeviceName(currentRecord.deviceName || info.deviceName)
      if (currentRecord.employeeId) {
        setEmployeeId(currentRecord.employeeId)
      } else if (authUser?.employeeId) {
        setEmployeeId(authUser.employeeId)
      }

      if (currentRecord.employeeName) {
        setEmployeeName(currentRecord.employeeName)
      } else if (authUser?.displayName) {
        setEmployeeName(authUser.displayName)
      }

      if (currentRecord.department) setDepartment(currentRecord.department)
      return info
    } catch (err: any) {
      setError(err?.message || 'Failed to initialize device identity.')
      return null
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setError(null)
    setSuccessMsg(null)

    // Validation
    if (!employeeId.trim()) {
      setError('Please enter your Employee ID.')
      return
    }
    if (!employeeName.trim()) {
      setError('Please enter your Full Name.')
      return
    }

    setSubmitting(true)
    try {
      const updated = await deviceService.registerDevice({
        employeeId: employeeId.trim(),
        employeeName: employeeName.trim(),
        department: department.trim() || 'General',
        deviceName: deviceName.trim() || deviceInfo?.deviceName,
      })
      setRecord(updated)
      setSuccessMsg('Registration request submitted successfully! Awaiting administrator approval.')
    } catch (err: any) {
      setError(err?.message || 'Registration failed.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCheckStatus = async () => {
    setError(null)
    setLoading(true)
    try {
      const current = await deviceService.getRegistrationRecord()
      setRecord(current)
    } catch (err: any) {
      setError(err?.message || 'Failed to refresh registration status.')
    } finally {
      setLoading(false)
    }
  }

  const handleSimulateDecision = async (decision: 'approved' | 'rejected') => {
    setError(null)
    setSubmitting(true)
    try {
      const updated = await deviceService.simulateAdminReview(
        decision,
        decision === 'rejected' ? 'Device hardware not authorized by organization policy.' : undefined
      )
      setRecord(updated)
    } catch (err: any) {
      setError(err?.message || 'Failed to update mock approval state.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReset = async () => {
    setError(null)
    setSuccessMsg(null)
    setLoading(true)
    try {
      await deviceService.resetRegistration()
      await loadData()
    } catch (err: any) {
      setError(err?.message || 'Failed to reset device registration.')
    } finally {
      setLoading(false)
    }
  }

  const handleProceedToWork = () => {
    if (!record || record.status !== 'approved') {
      setError('Access restricted: Only approved devices may access work sessions.')
      return
    }
    onRegistered({
      deviceId: record.deviceId,
      deviceName: record.deviceName,
      employeeId: record.employeeId,
      employeeName: record.employeeName,
      department: record.department,
    })
  }

  const currentStatus: DeviceRegistrationStatus = record?.status || 'not_registered'

  return (
    <div className="h-full flex flex-col bg-surface-950 text-white select-none">
      {/* ── Native Frameless Titlebar ───────────────────────── */}
      <div className="h-10 px-3.5 flex items-center justify-between titlebar-drag border-b border-white/5 bg-surface-900/80 backdrop-blur flex-shrink-0">
        <div className="flex items-center gap-2 titlebar-no-drag">
          <div className="w-5 h-5 rounded-lg bg-brand-600/30 border border-brand-500/30 flex items-center justify-center">
            <Shield className="w-3 h-3 text-brand-400" />
          </div>
          <span className="text-xs font-bold text-white tracking-wide">WorkTrack Pro</span>
          <span className="text-[10px] text-white/40 font-mono">Agent Setup</span>
        </div>
        <div className="flex items-center gap-2 titlebar-no-drag">
          {onLogout && (
            <button
              onClick={onLogout}
              className="px-2 py-0.5 rounded text-[10px] font-medium text-white/50 hover:text-white hover:bg-white/10 flex items-center gap-1 transition-colors"
              title="Sign in with a different account"
            >
              <LogOut className="w-3 h-3" />
              <span>Switch User</span>
            </button>
          )}
          <WindowControls />
        </div>
      </div>

      {/* ── Main Scrollable Body ────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-6 overflow-y-auto">
        <div className="w-full max-w-sm space-y-4 animate-slide-up">
          {/* Header & Logo */}
          <div className="text-center space-y-1.5">
            <div className="w-14 h-14 rounded-2xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center mx-auto shadow-glow-green">
              <Shield className="w-7 h-7 text-brand-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">WorkTrack Pro</h1>
              <p className="text-xs text-white/40">Employee Agent • Phase 3 Device Registration</p>
            </div>
            {authUser && (
              <div className="pt-0.5">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-white/70">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
                  <span>
                    Signed In: <strong className="text-white font-mono">{authUser.employeeId || authUser.displayName}</strong>
                  </span>
                  {onLogout && (
                    <button
                      type="button"
                      onClick={onLogout}
                      className="text-brand-400 hover:text-brand-300 underline font-medium ml-1"
                    >
                      (Log Out)
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Device Identity Hardware Chip */}
          <div className="glass-card p-3.5 space-y-2 border-white/10 bg-surface-900/60">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider flex items-center gap-1.5">
                <Monitor className="w-3.5 h-3.5 text-brand-400" />
                Detected Hardware Identity
              </span>
              <span className="text-[10px] font-mono text-brand-400 bg-brand-500/10 px-1.5 py-0.5 rounded border border-brand-500/20">
                Persistent UUID
              </span>
            </div>

            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between text-white/70">
                <span className="text-white/40 text-[11px]">Computer Name:</span>
                <span className="font-mono font-semibold text-white">{deviceInfo?.deviceName || 'Detecting...'}</span>
              </div>
              <div className="flex items-center justify-between text-white/70">
                <span className="text-white/40 text-[11px]">Device UUID:</span>
                <span className="font-mono text-[10px] text-brand-300 truncate max-w-[190px]" title={deviceInfo?.deviceId}>
                  {deviceInfo?.deviceId || 'Generating stable UUID...'}
                </span>
              </div>
            </div>
          </div>

          {/* Feedback messages */}
          {error && (
            <div className="p-3 rounded-xl bg-danger-500/15 border border-danger-500/30 flex items-start gap-2.5 text-xs text-danger-300 animate-fade-in">
              <AlertTriangle className="w-4 h-4 text-danger-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{error}</div>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-success-500/15 border border-success-500/30 flex items-start gap-2.5 text-xs text-success-300 animate-fade-in">
              <CheckCircle2 className="w-4 h-4 text-success-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{successMsg}</div>
            </div>
          )}

          {/* ── STATE 1: NOT REGISTERED ───────────────────────── */}
          {currentStatus === 'not_registered' && (
            <form onSubmit={handleRegister} className="glass-card p-5 space-y-3.5 border-brand-500/20">
              <div className="flex items-center justify-between pb-1 border-b border-white/5">
                <span className="text-xs font-bold text-white uppercase tracking-wider">Device Registration Form</span>
                <span className="text-[10px] text-white/40 font-mono">Status: Not Registered</span>
              </div>

              <div className="space-y-1">
                <label htmlFor="reg-emp-id" className="text-[11px] font-medium text-white/50 uppercase tracking-wider flex items-center gap-1.5">
                  <KeyRound className="w-3 h-3 text-white/30" />
                  Employee ID *
                </label>
                <input
                  id="reg-emp-id"
                  type="text"
                  placeholder="e.g. emp_001"
                  value={employeeId}
                  onChange={e => setEmployeeId(e.target.value)}
                  disabled={submitting || loading}
                  className="input-field py-2 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="reg-emp-name" className="text-[11px] font-medium text-white/50 uppercase tracking-wider flex items-center gap-1.5">
                  <User className="w-3 h-3 text-white/30" />
                  Full Name *
                </label>
                <input
                  id="reg-emp-name"
                  type="text"
                  placeholder="e.g. Sarah Johnson"
                  value={employeeName}
                  onChange={e => setEmployeeName(e.target.value)}
                  disabled={submitting || loading}
                  className="input-field py-2 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="reg-dept" className="text-[11px] font-medium text-white/50 uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 className="w-3 h-3 text-white/30" />
                  Department
                </label>
                <select
                  id="reg-dept"
                  value={department}
                  onChange={e => setDepartment(e.target.value)}
                  disabled={submitting || loading}
                  className="input-field py-2 text-xs cursor-pointer"
                >
                  <option value="Engineering">Engineering</option>
                  <option value="Design">Design</option>
                  <option value="Operations">Operations</option>
                  <option value="Marketing">Marketing</option>
                  <option value="Sales">Sales</option>
                </select>
              </div>

              <button
                type="submit"
                id="btn-register-device"
                disabled={submitting || loading}
                className="btn-primary w-full py-2.5 text-xs font-semibold shadow-glow-green mt-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Submitting Registration...
                  </>
                ) : (
                  <>
                    <Shield className="w-3.5 h-3.5" />
                    Register This Device
                  </>
                )}
              </button>

              {onLogout && (
                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={onLogout}
                    className="text-[11px] text-white/40 hover:text-white/80 transition-colors"
                  >
                    Want to sign in with password? <span className="text-brand-400 underline">Switch Account</span>
                  </button>
                </div>
              )}
            </form>
          )}

          {/* ── STATE 2: PENDING APPROVAL ─────────────────────── */}
          {currentStatus === 'pending_approval' && record && (
            <div className="glass-card p-5 space-y-4 border-warning-500/30 bg-warning-500/5 animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-warning-500/20 border border-warning-500/30 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 text-warning-400 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Registration Pending Approval</h3>
                  <p className="text-[11px] text-warning-300">Awaiting Admin Authorization</p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-surface-900 border border-white/5 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-white/40">Employee:</span>
                  <span className="font-semibold text-white">{record.employeeName} ({record.employeeId})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Department:</span>
                  <span className="text-white">{record.department}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Submitted At:</span>
                  <span className="font-mono text-white/60 text-[11px]">
                    {new Date(record.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {/* What the employee needs to do next */}
              <div className="p-3 rounded-xl bg-surface-800/60 border border-white/5 space-y-1 text-xs text-white/60">
                <p className="font-semibold text-white text-[11px]">What you need to do next:</p>
                <p className="text-[11px] leading-relaxed">
                  Your device has been registered with the server. Please inform your company administrator to approve this device from the <strong>WorkTrack Pro Admin Console</strong>. Monitoring & work sessions remain locked until approval.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleCheckStatus}
                  disabled={loading}
                  className="btn-secondary flex-1 py-2 text-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  Refresh Status
                </button>
                <button
                  onClick={handleReset}
                  className="btn-secondary py-2 px-3 text-xs text-white/50 hover:text-white"
                  title="Cancel and start over"
                >
                  Cancel
                </button>
              </div>

              {/* Phase 3 Mock Admin Decision Simulator */}
              <div className="pt-2 border-t border-white/10 space-y-2">
                <p className="text-[10px] text-white/40 text-center font-mono uppercase tracking-wider">
                  🧪 Phase 3 Mock Approval Simulator:
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleSimulateDecision('approved')}
                    disabled={submitting}
                    className="p-1.5 rounded-lg bg-success-500/15 border border-success-500/30 hover:bg-success-500/25 text-success-300 text-[11px] font-semibold flex items-center justify-center gap-1 transition-all"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    Simulate: Approve
                  </button>
                  <button
                    onClick={() => handleSimulateDecision('rejected')}
                    disabled={submitting}
                    className="p-1.5 rounded-lg bg-danger-500/15 border border-danger-500/30 hover:bg-danger-500/25 text-danger-300 text-[11px] font-semibold flex items-center justify-center gap-1 transition-all"
                  >
                    <XCircle className="w-3 h-3" />
                    Simulate: Reject
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── STATE 3: REJECTED ─────────────────────────────── */}
          {currentStatus === 'rejected' && record && (
            <div className="glass-card p-5 space-y-4 border-danger-500/40 bg-danger-500/5 animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-danger-500/20 border border-danger-500/30 flex items-center justify-center flex-shrink-0">
                  <XCircle className="w-5 h-5 text-danger-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Device Registration Rejected</h3>
                  <p className="text-[11px] text-danger-300">Access Denied by Administrator</p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-surface-900 border border-danger-500/20 text-xs space-y-1">
                <span className="text-[10px] text-white/40 uppercase font-semibold">Reason Provided:</span>
                <p className="text-xs text-white/80 leading-relaxed font-mono">
                  {record.rejectionReason || 'Hardware verification failed per security policy.'}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-surface-800/60 border border-white/5 space-y-1 text-xs text-white/60">
                <p className="font-semibold text-white text-[11px]">What you need to do next:</p>
                <p className="text-[11px] leading-relaxed">
                  Please verify your Employee ID and departmental assignment with your supervisor, then click Re-register below to submit an updated request.
                </p>
              </div>

              <button
                onClick={handleReset}
                className="btn-primary w-full py-2.5 text-xs font-semibold bg-danger-600 hover:bg-danger-500"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Re-register Device
              </button>
            </div>
          )}

          {/* ── STATE 4: APPROVED ─────────────────────────────── */}
          {currentStatus === 'approved' && record && (
            <div className="glass-card p-5 space-y-4 border-success-500/40 bg-success-500/5 animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-success-500/20 border border-success-500/30 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-success-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Device Approved & Authorized</h3>
                  <p className="text-[11px] text-success-300">Registration Complete</p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-surface-900 border border-white/5 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-white/40">Employee:</span>
                  <span className="font-semibold text-white">{record.employeeName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Employee ID:</span>
                  <span className="font-mono text-white/80">{record.employeeId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Department:</span>
                  <span className="text-white">{record.department}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Device Status:</span>
                  <span className="text-success-400 font-semibold uppercase text-[11px]">Approved</span>
                </div>
              </div>

              <button
                id="btn-proceed-work"
                onClick={handleProceedToWork}
                className="btn-primary w-full py-2.5 text-xs font-semibold bg-success-600 hover:bg-success-500 shadow-none flex items-center justify-center gap-2"
              >
                <span>Proceed with Approved Device</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <div className="flex justify-center">
                <button
                  onClick={handleReset}
                  className="text-[11px] text-white/30 hover:text-white/70 underline"
                >
                  Unlink / Change Device
                </button>
              </div>
            </div>
          )}

          {/* Privacy transparency summary footer */}
          <div className="p-3 rounded-xl bg-surface-900/60 border border-white/5 text-[11px] text-white/30 text-center leading-relaxed">
            <span className="text-brand-400 font-medium">Phase 3 Compliance:</span> Unregistered, pending, or rejected devices are strictly blocked from session tracking and monitoring.
          </div>
        </div>
      </div>
    </div>
  )
}
