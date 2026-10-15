import { useState, useEffect } from 'react'
import { Monitor, Maximize2, RefreshCw, Wifi, WifiOff, Loader2, AlertCircle, UserCheck } from 'lucide-react'
import { MOCK_EMPLOYEES, MOCK_DEVICES } from '../services/dataService'
import StatusBadge from '../components/StatusBadge'
import type { Employee, Device } from '@worktrack-pro/shared'

type ViewState = 'idle' | 'requesting' | 'pending_approval' | 'connecting' | 'active' | 'denied' | 'error'

interface EmployeeCell {
  employee: Employee
  device: Device
  viewState: ViewState
}

const VIEW_STATE_LABELS: Record<ViewState, string> = {
  idle: 'Click to request view',
  requesting: 'Sending request...',
  pending_approval: 'Awaiting employee approval...',
  connecting: 'Connecting...',
  active: 'Live — viewing screen',
  denied: 'Employee denied request',
  error: 'Connection error',
}

export default function LiveMonitor() {
  const [cells, setCells] = useState<EmployeeCell[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    const online = MOCK_DEVICES.filter(d => d.status !== 'offline')
    const built = online.map(device => ({
      employee: MOCK_EMPLOYEES.find(e => e.id === device.employeeId)!,
      device,
      viewState: 'idle' as ViewState,
    })).filter(c => !!c.employee)
    setCells(built)
  }, [])

  const updateCellState = (deviceId: string, state: ViewState) => {
    setCells(prev => prev.map(c =>
      c.device.id === deviceId ? { ...c, viewState: state } : c
    ))
  }

  const requestView = async (cell: EmployeeCell) => {
    if (cell.viewState !== 'idle' && cell.viewState !== 'denied' && cell.viewState !== 'error') return
    setSelectedId(cell.device.id)

    updateCellState(cell.device.id, 'requesting')
    await sleep(800)
    updateCellState(cell.device.id, 'pending_approval')

    // Simulate employee approval (Phase 2: real Firebase push notification)
    await sleep(2500)
    updateCellState(cell.device.id, 'connecting')
    await sleep(1000)
    updateCellState(cell.device.id, 'active')
  }

  const stopView = (deviceId: string) => {
    updateCellState(deviceId, 'idle')
    if (selectedId === deviceId) setSelectedId(null)
  }

  const selectedCell = cells.find(c => c.device.id === selectedId)

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header notice */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-brand-500/10 border border-brand-500/20">
        <UserCheck className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-brand-300">Live Screen Viewing — Employee Approval Required</p>
          <p className="text-xs text-white/50 mt-0.5">
            Every screen view request requires explicit approval from the employee. 
            The employee can deny or stop sharing at any time. 
            <strong className="text-warning-400"> Phase 1: Simulated flow only — no real streams.</strong>
          </p>
        </div>
      </div>

      {/* Fullscreen viewer */}
      {fullscreen && selectedCell?.viewState === 'active' && (
        <div className="fixed inset-0 z-50 bg-surface-950 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-surface-900">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-success-400 animate-pulse" />
              <span className="text-sm font-medium text-white">
                Viewing: {selectedCell.employee.name}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => stopView(selectedCell.device.id)} className="btn-danger text-xs">
                Stop Sharing
              </button>
              <button onClick={() => setFullscreen(false)} className="btn-secondary text-xs">
                Exit Fullscreen
              </button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center bg-surface-950">
            <div className="w-full max-w-5xl aspect-video bg-surface-800 rounded-xl flex items-center justify-center border border-brand-500/20">
              <div className="text-center space-y-3">
                <Monitor className="w-12 h-12 text-brand-400 mx-auto" />
                <p className="text-white/50 text-sm">Live stream placeholder</p>
                <p className="text-white/30 text-xs">Phase 2: WebRTC stream will appear here</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title">Device Monitor Grid</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/30">{cells.length} device(s) available</span>
          </div>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
          {cells.map(cell => (
            <MonitorCell
              key={cell.device.id}
              cell={cell}
              isSelected={selectedId === cell.device.id}
              onRequest={() => requestView(cell)}
              onStop={() => stopView(cell.device.id)}
              onFullscreen={() => { setSelectedId(cell.device.id); setFullscreen(true) }}
            />
          ))}

          {/* Empty slots up to 10 */}
          {Array.from({ length: Math.max(0, 6 - cells.length) }).map((_, i) => (
            <div key={`empty_${i}`} className="aspect-video rounded-xl bg-surface-800/40 border border-dashed border-white/10 flex items-center justify-center">
              <div className="text-center">
                <WifiOff className="w-6 h-6 text-white/15 mx-auto" />
                <p className="text-xs text-white/15 mt-1">No device</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MonitorCell({
  cell,
  isSelected,
  onRequest,
  onStop,
  onFullscreen,
}: {
  cell: EmployeeCell
  isSelected: boolean
  onRequest: () => void
  onStop: () => void
  onFullscreen: () => void
}) {
  const { employee, device, viewState } = cell
  const isLive = viewState === 'active'
  const isBusy = viewState === 'requesting' || viewState === 'pending_approval' || viewState === 'connecting'

  return (
    <div className={`rounded-xl overflow-hidden border transition-all duration-300 ${
      isLive
        ? 'border-success-500/40 shadow-[0_0_20px_rgba(34,197,94,0.15)]'
        : isSelected
        ? 'border-brand-500/40'
        : 'border-white/10'
    }`}>
      {/* Screen area */}
      <div className="aspect-video bg-surface-800 relative flex items-center justify-center group cursor-pointer"
           onClick={isLive ? undefined : onRequest}>
        {isLive ? (
          <div className="inset-0 absolute flex items-center justify-center bg-surface-800">
            <div className="text-center space-y-2">
              <Monitor className="w-8 h-8 text-brand-400 mx-auto" />
              <p className="text-xs text-white/40">Live stream</p>
              <p className="text-[10px] text-white/20">Phase 2: WebRTC</p>
            </div>
          </div>
        ) : isBusy ? (
          <div className="text-center space-y-2">
            <Loader2 className="w-6 h-6 text-brand-400 mx-auto animate-spin" />
            <p className="text-xs text-white/40">{VIEW_STATE_LABELS[viewState]}</p>
          </div>
        ) : viewState === 'denied' || viewState === 'error' ? (
          <div className="text-center space-y-2">
            <AlertCircle className="w-6 h-6 text-danger-400 mx-auto" />
            <p className="text-xs text-danger-400">{VIEW_STATE_LABELS[viewState]}</p>
            <p className="text-[10px] text-white/30">Click to retry</p>
          </div>
        ) : (
          <div className="text-center space-y-2 opacity-40 group-hover:opacity-80 transition-opacity">
            <Monitor className="w-6 h-6 text-white/60 mx-auto" />
            <p className="text-xs text-white/60">Click to request view</p>
          </div>
        )}

        {/* Live badge */}
        {isLive && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-danger-600/90 text-[10px] font-bold text-white">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            LIVE
          </div>
        )}

        {/* Fullscreen button */}
        {isLive && (
          <button
            onClick={e => { e.stopPropagation(); onFullscreen() }}
            className="absolute top-2 right-2 w-6 h-6 rounded bg-surface-900/80 flex items-center justify-center hover:bg-surface-800 transition-colors"
          >
            <Maximize2 className="w-3 h-3 text-white/70" />
          </button>
        )}
      </div>

      {/* Info bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-surface-800/60">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-brand-600/30 flex items-center justify-center text-[10px] font-bold text-brand-300 flex-shrink-0">
            {employee.name.split(' ').map(n => n[0]).join('')}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-white truncate">{employee.name}</p>
            <p className="text-[10px] text-white/30 truncate">{device.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <StatusBadge status={device.status} showLabel={false} />
          {isLive && (
            <button onClick={onStop} className="btn-danger py-0.5 px-2 text-[10px]">
              Stop
            </button>
          )}
          {!isLive && !isBusy && (
            <button onClick={onRequest} className="btn-secondary py-0.5 px-2 text-[10px]">
              <Wifi className="w-2.5 h-2.5" />
              View
            </button>
          )}
          {isBusy && (
            <button onClick={() => {}} className="btn-secondary py-0.5 px-2 text-[10px]" disabled>
              <RefreshCw className="w-2.5 h-2.5 animate-spin" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}
