import { useState } from 'react'
import { Shield, Monitor, Loader2, CheckCircle, AlertCircle, Building2 } from 'lucide-react'
import type { DeviceIdentity } from '../App'
import WindowControls from '../components/WindowControls'

interface Props {
  onRegistered: (identity: DeviceIdentity) => void
}

type RegState = 'idle' | 'registering' | 'success' | 'error'

export default function RegistrationScreen({ onRegistered }: Props) {
  const [employeeId, setEmployeeId] = useState('')
  const [employeeName, setEmployeeName] = useState('')
  const [deviceName, setDeviceName] = useState(() => getHostname())
  const [state, setState] = useState<RegState>('idle')
  const [error, setError] = useState('')

  const handleRegister = async () => {
    if (!employeeId.trim() || !employeeName.trim() || !deviceName.trim()) {
      setError('All fields are required.')
      return
    }
    setError('')
    setState('registering')

    try {
      // In dev/browser mode, electronAPI may not be available — use mock fallback
      const api = (window as any).electronAPI
      let result: { success: boolean; data?: any; error?: string }

      if (api) {
        result = await api.invoke('device:register', {
          employeeId: employeeId.trim(),
          employeeName: employeeName.trim(),
          deviceName: deviceName.trim(),
        })
      } else {
        // Browser fallback for development without Electron
        await sleep(1200)
        result = {
          success: true,
          data: { deviceId: `dev_mock_${Date.now()}` },
        }
      }

      if (result.success) {
        setState('success')
        await sleep(800)
        onRegistered({
          employeeId: employeeId.trim(),
          employeeName: employeeName.trim(),
          deviceId: result.data?.deviceId ?? `dev_${Date.now()}`,
          deviceName: deviceName.trim(),
        })
      } else {
        setError(result.error ?? 'Registration failed.')
        setState('error')
      }
    } catch (err) {
      setError('Unexpected error. Please try again.')
      setState('error')
    }
  }

  const isLoading = state === 'registering' || state === 'success'

  return (
    <div className="h-full flex flex-col bg-surface-950">
      {/* Top draggable bar with window controls */}
      <div className="h-10 px-3 flex items-center justify-between titlebar-drag border-b border-white/5 flex-shrink-0">
        <span className="text-[11px] font-semibold text-white/40 tracking-wider uppercase font-mono titlebar-no-drag">
          Device Registration
        </span>
        <div className="titlebar-no-drag">
          <WindowControls />
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-6 overflow-y-auto">
        <div className="w-full max-w-sm space-y-5 animate-slide-up">
          {/* Logo */}
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center mx-auto shadow-glow-green">
              <Shield className="w-7 h-7 text-brand-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">WorkTrack Pro</h1>
              <p className="text-xs text-white/40 mt-0.5">Desktop Employee Agent</p>
            </div>
          </div>

        {/* Form card */}
        <div className="glass-card p-6 space-y-4">
          <div className="space-y-1">
            <label htmlFor="reg-employee-id" className="text-xs font-medium text-white/40 uppercase tracking-wider">
              Employee ID
            </label>
            <input
              id="reg-employee-id"
              type="text"
              placeholder="e.g. emp_001 or EMP-2024"
              value={employeeId}
              onChange={e => setEmployeeId(e.target.value)}
              disabled={isLoading}
              className="input-field"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="reg-employee-name" className="text-xs font-medium text-white/40 uppercase tracking-wider">
              Your Name
            </label>
            <input
              id="reg-employee-name"
              type="text"
              placeholder="e.g. Sarah Johnson"
              value={employeeName}
              onChange={e => setEmployeeName(e.target.value)}
              disabled={isLoading}
              className="input-field"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="reg-device-name" className="text-xs font-medium text-white/40 uppercase tracking-wider">
              Device Name
            </label>
            <div className="relative">
              <Monitor className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
              <input
                id="reg-device-name"
                type="text"
                placeholder="Your device hostname"
                value={deviceName}
                onChange={e => setDeviceName(e.target.value)}
                disabled={isLoading}
                className="input-field pl-9"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-danger-500/10 border border-danger-500/20">
              <AlertCircle className="w-4 h-4 text-danger-400 flex-shrink-0" />
              <p className="text-xs text-danger-400">{error}</p>
            </div>
          )}

          <button
            id="register-device-btn"
            onClick={handleRegister}
            disabled={isLoading}
            className="btn-primary w-full"
          >
            {state === 'registering' && <Loader2 className="w-4 h-4 animate-spin" />}
            {state === 'success' && <CheckCircle className="w-4 h-4" />}
            {state === 'idle' || state === 'error' ? 'Register Device' : state === 'registering' ? 'Registering...' : 'Registered!'}
          </button>
        </div>

        {/* Info */}
        <div className="glass-card p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-brand-400" />
            <p className="text-xs font-semibold text-white/60">Phase 1 — Mock Connection</p>
          </div>
          <p className="text-[11px] text-white/30 leading-relaxed">
            Firebase is not configured yet. Registration creates a local device identity only.
            Backend connection will be enabled in Phase 2.
          </p>
        </div>

        {/* Privacy notice */}
        <p className="text-[11px] text-white/20 text-center leading-relaxed">
          By registering, you acknowledge that this application may capture periodic screenshots
          during active work sessions. All monitoring activity is visible to you at all times.
        </p>
      </div>
    </div>
  </div>
)
}

function getHostname(): string {
  // In Electron context this might be available
  return (window as any).__hostname__ ?? 'MY-LAPTOP'
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}
