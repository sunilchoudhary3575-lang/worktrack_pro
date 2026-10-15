import { useState, useEffect } from 'react'
import { Search, Filter, Calendar, Download } from 'lucide-react'
import { dataService, MOCK_EMPLOYEES } from '../services/dataService'
import { SkeletonCard } from '../components/Skeleton'
import type { Screenshot } from '@worktrack-pro/shared'

export default function Screenshots() {
  const [loading, setLoading] = useState(true)
  const [screenshots, setScreenshots] = useState<Screenshot[]>([])
  const [filterEmployee, setFilterEmployee] = useState('')
  const [selected, setSelected] = useState<Screenshot | null>(null)

  useEffect(() => {
    dataService.getScreenshots(filterEmployee ? { employeeId: filterEmployee } : undefined)
      .then(shots => { setScreenshots(shots); setLoading(false) })
  }, [filterEmployee])

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-700 border border-white/10">
          <Filter className="w-4 h-4 text-white/30" />
          <select
            id="screenshot-employee-filter"
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
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-700 border border-white/10">
          <Calendar className="w-4 h-4 text-white/30" />
          <input
            id="screenshot-date-filter"
            type="date"
            className="bg-transparent text-sm text-white/70 outline-none cursor-pointer"
            defaultValue={new Date().toISOString().split('T')[0]}
          />
        </div>
        <button className="btn-secondary ml-auto" disabled title="Phase 2: requires Firebase Storage">
          <Download className="w-4 h-4" />
          Export
        </button>
      </div>

      {/* Gallery */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title">Screenshot History</h2>
          <span className="text-xs text-white/30 font-mono">⚠ Placeholder images — {screenshots.length} shown</span>
        </div>

        {loading ? (
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {screenshots.map(scr => {
              const emp = MOCK_EMPLOYEES.find(e => e.id === scr.employeeId)
              return (
                <div
                  key={scr.id}
                  className="group relative rounded-xl overflow-hidden bg-surface-700 cursor-pointer border border-white/5 hover:border-brand-500/30 transition-all"
                  onClick={() => setSelected(scr)}
                >
                  <img
                    src={scr.imageUrl}
                    alt={`Screenshot — ${emp?.name}`}
                    className="w-full aspect-video object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-surface-950/90 to-transparent p-3">
                    <p className="text-xs font-medium text-white truncate">{emp?.name}</p>
                    <p className="text-[10px] text-white/40">
                      {scr.takenAt.toLocaleDateString()} {scr.takenAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-surface-950/95 flex items-center justify-center p-8"
          onClick={() => setSelected(null)}
        >
          <div className="max-w-4xl w-full space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">
                  {MOCK_EMPLOYEES.find(e => e.id === selected.employeeId)?.name}
                </p>
                <p className="text-xs text-white/40">{selected.takenAt.toLocaleString()}</p>
              </div>
              <button className="btn-secondary" onClick={() => setSelected(null)}>Close</button>
            </div>
            <img
              src={selected.imageUrl}
              alt="Screenshot preview"
              className="w-full rounded-xl border border-white/10"
            />
            <p className="text-xs text-center text-warning-400">
              ⚠ This is a placeholder image — not real employee activity
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
