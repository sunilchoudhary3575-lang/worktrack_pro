import { useState, useEffect } from 'react'
import {
  Users,
  Monitor,
  Camera,
  TrendingUp,
  AlertTriangle,
  Activity,
  Wifi,
  Database,
  CheckCircle2,
  Inbox,
} from 'lucide-react'
import { dataService, isLiveFirestoreActive } from '../services/dataService'
import { SkeletonCard } from '../components/Skeleton'
import StatusBadge from '../components/StatusBadge'
import type { Employee, Device, WorkSession, Screenshot } from '@worktrack-pro/shared'

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = 'brand',
}: {
  icon: React.ElementType
  label: string
  value: string | number
  sub?: string
  color?: 'brand' | 'accent' | 'success' | 'warning' | 'danger'
}) {
  const colorMap = {
    brand:   'bg-brand-500/15 text-brand-400 border-brand-500/20',
    accent:  'bg-accent-500/15 text-accent-400 border-accent-500/20',
    success: 'bg-success-500/15 text-success-400 border-success-500/20',
    warning: 'bg-warning-500/15 text-warning-400 border-warning-500/20',
    danger:  'bg-danger-500/15 text-danger-400 border-danger-500/20',
  }
  return (
    <div className="glass-card p-5 animate-slide-up">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-white/40 uppercase tracking-wider">{label}</p>
          <p className="text-3xl font-bold text-white mt-1">{value}</p>
          {sub && <p className="text-xs text-white/40 mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${colorMap[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [sessions, setSessions] = useState<WorkSession[]>([])
  const [screenshots, setScreenshots] = useState<Screenshot[]>([])
  const [isLive, setIsLive] = useState(false)

  useEffect(() => {
    const live = isLiveFirestoreActive()
    setIsLive(live)

    Promise.all([
      dataService.getEmployees(),
      dataService.getDevices(),
      dataService.getActiveSessions(),
      dataService.getScreenshots(),
    ])
      .then(([emps, devs, sess, scrs]) => {
        setEmployees(emps)
        setDevices(devs)
        setSessions(sess)
        setScreenshots(scrs)
      })
      .catch(err => {
        console.error('[Dashboard] Error fetching initial data:', err)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  const onlineDevices = devices.filter(d => d.status === 'online').length
  const recentScreenshots = screenshots.slice(0, 6)

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Total Employees"
          value={employees.length}
          sub={isLive ? 'Cloud Firestore profiles' : 'Registered accounts'}
          color="brand"
        />
        <StatCard
          icon={Wifi}
          label="Online Devices"
          value={onlineDevices}
          sub={`of ${devices.length} registered devices`}
          color="success"
        />
        <StatCard
          icon={Activity}
          label="Active Sessions"
          value={sessions.length}
          sub="Working right now"
          color="accent"
        />
        <StatCard
          icon={Camera}
          label="Screenshots Today"
          value={screenshots.length}
          sub={screenshots.length > 0 ? 'Across active sessions' : 'No captures today'}
          color="warning"
        />
      </div>

      {/* Middle row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Employee status list */}
        <div className="col-span-2 glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title">Employee Status</h2>
            {isLive ? (
              <span className="stat-badge bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Firestore Data
              </span>
            ) : (
              <span className="text-xs text-amber-400/80 font-mono">⚠ Offline Demo Data</span>
            )}
          </div>

          {employees.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-surface-800 border border-white/5 flex items-center justify-center text-white/30">
                <Inbox className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">No Employees Registered</p>
                <p className="text-xs text-white/40 mt-1 max-w-sm">
                  {isLive
                    ? 'Firestore collection /employees is currently empty. Add corporate employee profiles from the Employees tab.'
                    : 'No employees found in the demo dataset.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {employees.map(emp => {
                const device = devices.find(d => d.employeeId === emp.id)
                const session = sessions.find(s => s.employeeId === emp.id && s.status === 'active')
                return (
                  <div
                    key={emp.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-surface-700/40 hover:bg-surface-700/70 transition-colors"
                  >
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-xl bg-brand-600/30 flex items-center justify-center text-sm font-bold text-brand-300 flex-shrink-0">
                      {emp.name
                        ? emp.name
                            .split(' ')
                            .map(n => n[0])
                            .join('')
                        : 'E'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{emp.name}</p>
                      <p className="text-xs text-white/40 truncate">
                        {emp.department || 'General'} · {device?.name ?? 'No device'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <StatusBadge status={device?.status ?? 'offline'} />
                      {session && (
                        <span className="stat-badge bg-accent-500/15 text-accent-400 border border-accent-500/20">
                          <Activity className="w-2.5 h-2.5" />
                          Working
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Quick stats & Connection Status */}
        <div className="space-y-4">
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-brand-400" />
              <h3 className="text-sm font-semibold text-white">Today's Overview</h3>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Registered Team', value: `${employees.length} members` },
                { label: 'Online Devices', value: `${onlineDevices} / ${devices.length}` },
                { label: 'Screenshots Captured', value: String(screenshots.length) },
                { label: 'Active Work Sessions', value: String(sessions.length) },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-xs text-white/40">{item.label}</span>
                  <span className="text-sm font-semibold text-white font-mono">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Real Cloud Sync Status Card */}
          <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-2">
              {isLive ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                    Phase 2 — Live Data Sync
                  </h3>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                    Offline Demo Session
                  </h3>
                </>
              )}
            </div>
            <p className="text-xs text-white/50 leading-relaxed">
              {isLive ? (
                <>
                  Connected to cloud Firestore (<code>worktrack-pro-8aa42</code>). Real-time subscription listeners and secure role-based access control are actively running.
                </>
              ) : (
                <>
                  Currently viewing offline demo mock records. To view live enterprise telemetry, sign in with your authorized Firebase administrator credentials.
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Recent Screenshots */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title">Recent Screenshots</h2>
          {isLive ? (
            <span className="text-xs text-white/40 font-mono">Real-time captures</span>
          ) : (
            <span className="text-xs text-amber-400/80 font-mono">⚠ Placeholder images</span>
          )}
        </div>

        {recentScreenshots.length === 0 ? (
          <div className="py-10 flex flex-col items-center justify-center text-center space-y-2">
            <div className="w-10 h-10 rounded-xl bg-surface-800 border border-white/5 flex items-center justify-center text-white/30">
              <Camera className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-white">No Screenshots Captured Today</p>
            <p className="text-[11px] text-white/40 max-w-sm">
              Screenshots will appear here once registered employees begin active tracking sessions.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-6 gap-3">
            {recentScreenshots.map(scr => {
              const emp = employees.find(e => e.id === scr.employeeId)
              return (
                <div
                  key={scr.id}
                  className="group relative rounded-xl overflow-hidden bg-surface-700 cursor-pointer"
                >
                  <img
                    src={scr.imageUrl}
                    alt={`Screenshot — ${emp?.name ?? 'Employee'}`}
                    className="w-full aspect-video object-cover"
                  />
                  <div className="absolute inset-0 bg-surface-950/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                    <p className="text-xs font-medium text-white text-center px-1 truncate w-full text-center">
                      {emp?.name ?? 'Employee'}
                    </p>
                    <p className="text-[10px] text-white/50">
                      {scr.takenAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
