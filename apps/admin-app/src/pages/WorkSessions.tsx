import { useState, useEffect } from 'react'
import { Clock, Play, Square, Filter } from 'lucide-react'
import { dataService, MOCK_EMPLOYEES } from '../services/dataService'
import { SkeletonTable } from '../components/Skeleton'
import StatusBadge from '../components/StatusBadge'
import type { WorkSession } from '@worktrack-pro/shared'

function formatDuration(seconds?: number): string {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

function calcDuration(session: WorkSession): number {
  const end = session.endedAt ?? new Date()
  return Math.floor((end.getTime() - session.startedAt.getTime()) / 1000)
}

export default function WorkSessions() {
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<WorkSession[]>([])
  const [filterEmployee, setFilterEmployee] = useState('')

  useEffect(() => {
    dataService.getSessions(filterEmployee || undefined).then(sess => {
      setSessions(sess)
      setLoading(false)
    })
  }, [filterEmployee])

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-700 border border-white/10">
          <Filter className="w-4 h-4 text-white/30" />
          <select
            id="sessions-employee-filter"
            value={filterEmployee}
            onChange={e => { setFilterEmployee(e.target.value); setLoading(true) }}
            className="bg-transparent text-sm text-white/70 outline-none cursor-pointer"
          >
            <option value="">All Employees</option>
            {MOCK_EMPLOYEES.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Active sessions */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title">Work Sessions</h2>
          <span className="text-xs text-white/30 font-mono">⚠ Mock Data</span>
        </div>

        {loading ? (
          <SkeletonTable rows={5} />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {['Employee', 'Status', 'Started', 'Ended', 'Duration', 'Device'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-white/30 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sessions.map(sess => {
                const emp = MOCK_EMPLOYEES.find(e => e.id === sess.employeeId)
                const duration = calcDuration(sess)
                return (
                  <tr key={sess.id} className="hover:bg-surface-700/30 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-brand-600/20 flex items-center justify-center text-xs font-bold text-brand-300 flex-shrink-0">
                          {emp?.name.split(' ').map(n => n[0]).join('') ?? '?'}
                        </div>
                        <span className="text-sm font-medium text-white">{emp?.name ?? 'Unknown'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={sess.status} />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <Play className="w-3 h-3 text-success-400" />
                        <span className="text-sm text-white/70">
                          {sess.startedAt.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      {sess.endedAt ? (
                        <div className="flex items-center gap-1.5">
                          <Square className="w-3 h-3 text-danger-400" />
                          <span className="text-sm text-white/70">
                            {sess.endedAt.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-success-400 font-medium">Ongoing</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-white/30" />
                        <span className="text-sm font-mono text-white/70">{formatDuration(duration)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs font-mono text-white/40">{sess.deviceId}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
