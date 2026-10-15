import { useState, useEffect } from 'react'
import { Search, UserPlus, Monitor, Activity } from 'lucide-react'
import { dataService, MOCK_DEVICES, MOCK_SESSIONS } from '../services/dataService'
import { SkeletonTable } from '../components/Skeleton'
import StatusBadge from '../components/StatusBadge'
import type { Employee } from '@worktrack-pro/shared'

export default function Employees() {
  const [loading, setLoading] = useState(true)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    dataService.getEmployees().then(emps => {
      setEmployees(emps)
      setLoading(false)
    })
  }, [])

  const filtered = employees.filter(emp =>
    emp.name.toLowerCase().includes(search.toLowerCase()) ||
    emp.email.toLowerCase().includes(search.toLowerCase()) ||
    (emp.department ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            id="employee-search"
            type="text"
            placeholder="Search employees..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field pl-9"
          />
        </div>
        <button className="btn-primary ml-auto" disabled title="Phase 2: Firebase required">
          <UserPlus className="w-4 h-4" />
          Add Employee
        </button>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h2 className="section-title">All Employees</h2>
          <span className="text-xs text-white/30 font-mono">⚠ Mock Data — {filtered.length} records</span>
        </div>

        {loading ? (
          <div className="p-5"><SkeletonTable rows={5} /></div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {['Employee', 'Department', 'Device', 'Device Status', 'Session', 'Role'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium text-white/30 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map(emp => {
                const device = MOCK_DEVICES.find(d => d.employeeId === emp.id)
                const session = MOCK_SESSIONS.find(s => s.employeeId === emp.id && s.status === 'active')
                return (
                  <tr key={emp.id} className="hover:bg-surface-700/30 transition-colors group">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-brand-600/20 flex items-center justify-center text-sm font-bold text-brand-300 flex-shrink-0">
                          {emp.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{emp.name}</p>
                          <p className="text-xs text-white/40">{emp.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-white/70">{emp.department ?? '—'}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <Monitor className="w-3.5 h-3.5 text-white/30" />
                        <span className="text-sm text-white/70 font-mono text-xs">
                          {device?.name ?? 'Unregistered'}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={device?.status ?? 'offline'} />
                    </td>
                    <td className="px-5 py-3.5">
                      {session ? (
                        <span className="stat-badge bg-accent-500/15 text-accent-400 border border-accent-500/20">
                          <Activity className="w-2.5 h-2.5" />
                          Active
                        </span>
                      ) : (
                        <span className="text-xs text-white/30">No session</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`stat-badge capitalize ${
                        emp.role === 'admin'
                          ? 'bg-brand-500/15 text-brand-400 border border-brand-500/20'
                          : emp.role === 'manager'
                          ? 'bg-warning-500/15 text-warning-400 border border-warning-500/20'
                          : 'bg-surface-600 text-white/40 border border-white/10'
                      }`}>
                        {emp.role}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {!loading && filtered.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-white/30 text-sm">No employees match your search.</p>
          </div>
        )}
      </div>
    </div>
  )
}
