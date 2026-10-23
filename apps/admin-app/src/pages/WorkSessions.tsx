import { useState, useEffect, useMemo, useCallback } from 'react'
import { Clock, Play, Square, Filter, Database, Calendar, ArrowUpDown, ArrowDown, ArrowUp, X } from 'lucide-react'
import { dataService, isLiveFirestoreActive, MOCK_EMPLOYEES, MOCK_DEVICES } from '../services/dataService'
import { SkeletonTable } from '../components/Skeleton'
import StatusBadge from '../components/StatusBadge'
import type { WorkSession, Employee, Device } from '@worktrack-pro/shared'
import { deriveEmployeePresence } from '@worktrack-pro/shared'

function formatDuration(seconds?: number): string {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

export default function WorkSessions() {
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<WorkSession[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [currentTime, setCurrentTime] = useState(new Date())
  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [sortBy, setSortBy] = useState<'started' | 'duration'>('started')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [isLive, setIsLive] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    setIsLive(isLiveFirestoreActive())
    dataService.getEmployees().then(emps => {
      if (emps && emps.length > 0) {
        setEmployees(emps)
      } else {
        setEmployees(MOCK_EMPLOYEES)
      }
    }).catch(() => {
      setEmployees(MOCK_EMPLOYEES)
    })

    const unsubDevices = dataService.subscribeToDevices?.(devs => {
      if (devs && devs.length > 0) {
        setDevices(devs)
      } else {
        setDevices(MOCK_DEVICES)
      }
    })

    return () => {
      if (typeof unsubDevices === 'function') unsubDevices()
    }
  }, [])

  useEffect(() => {
    let unsub: (() => void) | undefined

    if (isLiveFirestoreActive()) {
      unsub = dataService.subscribeToSessions(
        all => {
          setSessions(all)
          setLoading(false)
        },
        () => {
          dataService.getSessions().then(sess => {
            setSessions(sess)
            setLoading(false)
          })
        }
      )
    } else {
      dataService.getSessions().then(sess => {
        setSessions(sess)
        setLoading(false)
      })
    }

    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [])

  // Resolve session status, active presence and accurate duration
  const getSessionDetails = useCallback((sess: WorkSession) => {
    const startD = sess.startedAt instanceof Date ? sess.startedAt : new Date(sess.startedAt)
    const endD = sess.endedAt ? (sess.endedAt instanceof Date ? sess.endedAt : new Date(sess.endedAt)) : undefined

    // Check device presence
    const empDevices = devices.filter(d => (sess.deviceId && d.id === sess.deviceId) || (sess.employeeId && d.employeeId === sess.employeeId))
    const primaryDev = empDevices.find(d => d.id === sess.deviceId) || empDevices[0]
    const isOnline = deriveEmployeePresence(empDevices, undefined, currentTime) === 'online'

    let lastActiveTime: Date | undefined = undefined
    if (primaryDev?.lastHeartbeat || primaryDev?.lastSeen) {
      const hb = primaryDev.lastHeartbeat || primaryDev.lastSeen
      lastActiveTime = hb instanceof Date ? hb : new Date(hb)
    }

    let effectiveStatus: string = sess.status
    let isOngoing = false
    let durationSeconds = 0

    if (endD) {
      // Concluded normally
      effectiveStatus = sess.status === 'working' ? 'completed' : sess.status
      durationSeconds = Math.max(0, Math.floor((endD.getTime() - startD.getTime()) / 1000))
    } else if (isOnline) {
      // Actively online and working/on-break
      effectiveStatus = sess.status
      isOngoing = true
      durationSeconds = Math.max(0, Math.floor((currentTime.getTime() - startD.getTime()) / 1000))
    } else {
      // System is powered off / offline
      effectiveStatus = 'offline'
      isOngoing = false
      // Cap duration at last known heartbeat time so it doesn't inflate while system is off
      const capEnd = lastActiveTime && lastActiveTime.getTime() > startD.getTime() ? lastActiveTime : (endD || startD)
      durationSeconds = Math.max(0, Math.floor((capEnd.getTime() - startD.getTime()) / 1000))
    }

    return {
      startD,
      endD,
      isOnline,
      isOngoing,
      effectiveStatus,
      durationSeconds,
      lastActiveTime,
      primaryDev,
    }
  }, [devices, currentTime])

  // Date-wise and duration sorting & filtering
  const filteredAndSortedSessions = useMemo(() => {
    let list = [...sessions]

    if (filterEmployee) {
      list = list.filter(s => s.employeeId === filterEmployee)
    }

    if (filterDate) {
      list = list.filter(s => {
        const d = s.startedAt instanceof Date ? s.startedAt : new Date(s.startedAt)
        const yyyy = d.getFullYear()
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        return `${yyyy}-${mm}-${dd}` === filterDate
      })
    }

    list.sort((a, b) => {
      const aStart = (a.startedAt instanceof Date ? a.startedAt : new Date(a.startedAt)).getTime()
      const bStart = (b.startedAt instanceof Date ? b.startedAt : new Date(b.startedAt)).getTime()

      if (sortBy === 'started') {
        return sortOrder === 'desc' ? bStart - aStart : aStart - bStart
      }
      if (sortBy === 'duration') {
        const aDur = getSessionDetails(a).durationSeconds
        const bDur = getSessionDetails(b).durationSeconds
        return sortOrder === 'desc' ? bDur - aDur : aDur - bDur
      }
      return 0
    })

    return list
  }, [sessions, filterEmployee, filterDate, sortBy, sortOrder, getSessionDetails])

  const todayStr = useMemo(() => {
    const d = new Date()
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }, [])

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Filter bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Employee filter */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-700 border border-white/10">
            <Filter className="w-4 h-4 text-white/30" />
            <select
              id="sessions-employee-filter"
              value={filterEmployee}
              onChange={e => setFilterEmployee(e.target.value)}
              className="bg-transparent text-sm text-white/70 outline-none cursor-pointer"
            >
              <option value="">All Employees</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>

          {/* Date filter */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-700 border border-white/10">
            <Calendar className="w-4 h-4 text-white/30" />
            <input
              type="date"
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              className="bg-transparent text-sm text-white/70 outline-none cursor-pointer [color-scheme:dark]"
              title="Filter by specific date"
            />
            {filterDate && (
              <button
                onClick={() => setFilterDate('')}
                className="p-0.5 rounded hover:bg-white/10 text-white/40 hover:text-white"
                title="Clear date filter"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick "Today" Filter Pill */}
          <button
            onClick={() => setFilterDate(filterDate === todayStr ? '' : todayStr)}
            className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
              filterDate === todayStr
                ? 'bg-brand-500/20 text-brand-300 border-brand-500/40 shadow-sm'
                : 'bg-surface-700 text-white/60 border-white/10 hover:text-white hover:bg-surface-600'
            }`}
          >
            Today Only
          </button>

          {/* Sort selector */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-700 border border-white/10">
            <ArrowUpDown className="w-4 h-4 text-white/30" />
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={e => {
                const [by, ord] = e.target.value.split('-') as ['started' | 'duration', 'desc' | 'asc']
                setSortBy(by)
                setSortOrder(ord)
              }}
              className="bg-transparent text-sm text-white/70 outline-none cursor-pointer"
            >
              <option value="started-desc">Date: Newest First (Latest)</option>
              <option value="started-asc">Date: Oldest First</option>
              <option value="duration-desc">Duration: Longest First</option>
              <option value="duration-asc">Duration: Shortest First</option>
            </select>
          </div>
        </div>

        {/* Live / Demo Mode Badge */}
        {isLive ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-success-500/15 border border-success-500/30 text-success-400 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-success-400 animate-pulse" />
            <Database className="w-3.5 h-3.5" />
            <span>Live Firestore</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-warning-500/15 border border-warning-500/30 text-warning-400 text-xs font-medium">
            <span>⚠ Demo Mode</span>
          </div>
        )}
      </div>

      {/* Sessions table */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title">Work Sessions</h2>
          <span className="text-xs text-white/40 font-mono">
            {filteredAndSortedSessions.length} {filteredAndSortedSessions.length === 1 ? 'session' : 'sessions'}
            {(filterEmployee || filterDate) && ` (filtered from ${sessions.length})`}
          </span>
        </div>

        {loading ? (
          <SkeletonTable rows={5} />
        ) : filteredAndSortedSessions.length === 0 ? (
          <div className="text-center py-12 text-white/40">
            <Clock className="w-8 h-8 mx-auto mb-2 text-white/20" />
            <p className="text-sm font-medium">No work sessions found</p>
            <p className="text-xs text-white/30 mt-1">
              {filterEmployee || filterDate
                ? 'Try clearing or adjusting your employee or date filters'
                : 'Sessions started by employees will appear here in real time'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="px-4 py-3 text-left text-xs font-medium text-white/30 uppercase tracking-wider">
                    Employee
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-white/30 uppercase tracking-wider">
                    Status
                  </th>
                  <th
                    onClick={() => {
                      if (sortBy === 'started') {
                        setSortOrder(o => (o === 'desc' ? 'asc' : 'desc'))
                      } else {
                        setSortBy('started')
                        setSortOrder('desc')
                      }
                    }}
                    className="px-4 py-3 text-left text-xs font-medium text-white/50 hover:text-white uppercase tracking-wider cursor-pointer select-none transition-colors"
                    title="Click to toggle date sort order"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Started</span>
                      {sortBy === 'started' ? (
                        sortOrder === 'desc' ? (
                          <ArrowDown className="w-3.5 h-3.5 text-brand-400" />
                        ) : (
                          <ArrowUp className="w-3.5 h-3.5 text-brand-400" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-white/20" />
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-white/30 uppercase tracking-wider">
                    Ended
                  </th>
                  <th
                    onClick={() => {
                      if (sortBy === 'duration') {
                        setSortOrder(o => (o === 'desc' ? 'asc' : 'desc'))
                      } else {
                        setSortBy('duration')
                        setSortOrder('desc')
                      }
                    }}
                    className="px-4 py-3 text-left text-xs font-medium text-white/50 hover:text-white uppercase tracking-wider cursor-pointer select-none transition-colors"
                    title="Click to toggle duration sort order"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Duration</span>
                      {sortBy === 'duration' ? (
                        sortOrder === 'desc' ? (
                          <ArrowDown className="w-3.5 h-3.5 text-brand-400" />
                        ) : (
                          <ArrowUp className="w-3.5 h-3.5 text-brand-400" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-white/20" />
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-white/30 uppercase tracking-wider">
                    Device
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredAndSortedSessions.map(sess => {
                  const emp = employees.find(e => e.id === sess.employeeId)
                  const { startD, endD, isOngoing, effectiveStatus, durationSeconds, lastActiveTime } = getSessionDetails(sess)

                  return (
                    <tr key={sess.id} className="hover:bg-surface-700/30 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-brand-600/20 flex items-center justify-center text-xs font-bold text-brand-300 flex-shrink-0">
                            {emp?.name ? emp.name.split(' ').map(n => n[0]).join('') : (sess.employeeId || '?')}
                          </div>
                          <div>
                            <span className="text-sm font-medium text-white block">
                              {emp?.name ?? sess.employeeId}
                            </span>
                            <span className="text-xs text-white/40 font-mono">
                              {sess.employeeId}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={effectiveStatus} />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <Play className="w-3 h-3 text-success-400" />
                          <span className="text-sm text-white/90 font-medium">
                            {startD.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {endD ? (
                          <div className="flex items-center gap-1.5">
                            <Square className="w-3 h-3 text-danger-400" />
                            <span className="text-sm text-white/70">
                              {endD.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                          </div>
                        ) : isOngoing ? (
                          <span className="text-xs text-success-400 font-semibold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-success-400 animate-pulse" />
                            Ongoing
                          </span>
                        ) : (
                          <div
                            className="flex items-center gap-1.5"
                            title={lastActiveTime ? `System shut down / offline since ${lastActiveTime.toLocaleString()}` : 'System offline'}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
                            <span className="text-xs text-white/40">
                              Offline {lastActiveTime ? `(${lastActiveTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : ''}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3 text-white/30" />
                          <span className="text-sm font-mono text-white/70">{formatDuration(durationSeconds)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs font-mono text-white/40 truncate max-w-[200px] inline-block" title={sess.deviceId}>
                          {sess.deviceId}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
