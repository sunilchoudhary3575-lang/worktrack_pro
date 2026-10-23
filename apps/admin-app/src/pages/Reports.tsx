import { useState, useEffect } from 'react'
import {
  Download,
  TrendingUp,
  Calendar,
  Users,
  Activity,
  Layers,
  Globe,
  Keyboard,
  MousePointer,
  Clock,
  Sparkles,
  FileText,
} from 'lucide-react'
import { dataService } from '../services/dataService'
import { SkeletonCard } from '../components/Skeleton'
import type { DailySummary, AppUsage, WebUsage, ActivityMetric, Employee } from '@worktrack-pro/shared'
import { useTheme } from '../context/ThemeContext'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  AreaChart,
  Area,
} from 'recharts'

function formatHours(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

function exportCSV(summaries: DailySummary[]) {
  const headers = 'Date,Employee ID,Total Hours,Sessions,Screenshots'
  const rows = summaries.map(s =>
    `${s.date},${s.employeeId},${(s.totalSessionSeconds / 3600).toFixed(2)},${s.sessionCount},${s.screenshotCount}`
  )
  const csv = [headers, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `worktrack-report-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function exportPDFMock() {
  const printWindow = window.open('', '_blank')
  if (printWindow) {
    printWindow.document.write(`
      <html>
        <head>
          <title>WorkTrack Pro Executive Productivity Report</title>
          <style>
            body { font-family: -apple-system, sans-serif; padding: 40px; color: #1e293b; }
            h1 { color: #4338ca; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; }
            .meta { color: #64748b; font-size: 14px; margin-bottom: 24px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; font-size: 13px; }
            th { background: #f8fafc; }
            .score { color: #16a34a; font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>WorkTrack Pro — Weekly Executive Report</h1>
          <div class="meta">
            Generated: ${new Date().toLocaleString()}<br/>
            Scope: Organization-wide Analytics (Mock Dataset)
          </div>
          <h3>Top Applications Breakdown</h3>
          <table>
            <tr><th>Application</th><th>Category</th><th>Avg Productivity</th></tr>
            <tr><td>Visual Studio Code</td><td>Productive</td><td class="score">98%</td></tr>
            <tr><td>Figma Design Suite</td><td>Productive</td><td class="score">99%</td></tr>
            <tr><td>Slack Collaboration</td><td>Productive</td><td class="score">88%</td></tr>
            <tr><td>Google Chrome</td><td>Mixed</td><td class="score">92%</td></tr>
          </table>
          <script>window.print()</script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }
}

export default function Reports() {
  const { theme } = useTheme()
  const [activeTab, setActiveTab] = useState<'overview' | 'productivity' | 'apps'>('overview')
  const [loading, setLoading] = useState(true)
  const [summaries, setSummaries] = useState<DailySummary[]>([])
  const [filterEmployee, setFilterEmployee] = useState('')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [appUsages, setAppUsages] = useState<AppUsage[]>([])
  const [webUsages, setWebUsages] = useState<WebUsage[]>([])
  const [activityMetrics, setActivityMetrics] = useState<ActivityMetric[]>([])

  useEffect(() => {
    dataService.getEmployees().then(emps => {
      setEmployees(emps || [])
    }).catch(() => {
      setEmployees([])
    })
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      dataService.getDailySummaries(filterEmployee || undefined),
      dataService.getAppUsages(filterEmployee || undefined),
      dataService.getWebUsages(filterEmployee || undefined),
      dataService.getActivityMetrics(),
    ]).then(([sum, apps, webs, acts]) => {
      setSummaries(sum)
      setAppUsages(apps)
      setWebUsages(webs)
      setActivityMetrics(acts)
      setLoading(false)
    })
  }, [filterEmployee])

  // Aggregate by date for chart
  const byDate = summaries.reduce<Record<string, number>>((acc, s) => {
    acc[s.date] = (acc[s.date] ?? 0) + s.totalSessionSeconds
    return acc
  }, {})

  const chartData = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, seconds]) => ({
      date: date.split('-').slice(1).join('/'),
      hours: parseFloat((seconds / 3600).toFixed(2)),
    }))

  const totalHours = summaries.reduce((acc, s) => acc + s.totalSessionSeconds, 0) / 3600
  const totalScreenshots = summaries.reduce((acc, s) => acc + s.screenshotCount, 0)
  const activeDays = new Set(summaries.filter(s => s.totalSessionSeconds > 0).map(s => s.date)).size

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Top Controls & Navigation Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        {/* Navigation tabs */}
        <div className="flex items-center gap-1 bg-surface-800 p-1 rounded-xl border border-white/5">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'overview'
                ? 'bg-brand-600 text-white shadow-glow-brand'
                : 'text-white/40 hover:text-white'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Sessions & Overview
          </button>
          <button
            onClick={() => setActiveTab('productivity')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'productivity'
                ? 'bg-brand-600 text-white shadow-glow-brand'
                : 'text-white/40 hover:text-white'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            Activity & Productivity
          </button>
          <button
            onClick={() => setActiveTab('apps')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'apps'
                ? 'bg-brand-600 text-white shadow-glow-brand'
                : 'text-white/40 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            App & Web Usage
          </button>
        </div>

        {/* Filter and Export buttons */}
        <div className="flex items-center gap-2.5">
          <select
            id="reports-employee-filter"
            value={filterEmployee}
            onChange={e => setFilterEmployee(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-surface-700 border border-white/10 text-xs text-white/80 outline-none cursor-pointer"
          >
            <option value="">All Employees</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>

          <button
            className="btn-secondary py-1.5 px-3 text-xs"
            onClick={() => exportCSV(summaries)}
            title="Download CSV report"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>

          <button
            className="btn-primary py-1.5 px-3 text-xs"
            onClick={exportPDFMock}
            title="Print or save PDF report"
          >
            <FileText className="w-3.5 h-3.5" />
            Print / PDF
          </button>
        </div>
      </div>

      {/* ── TAB 1: Overview & Sessions ── */}
      {activeTab === 'overview' && (
        <div className="space-y-5 animate-fade-in">
          {/* Summary stats */}
          {loading ? (
            <div className="grid grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <div className="glass-card p-5">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-brand-400" />
                  <p className="text-xs font-medium text-white/40 uppercase tracking-wider">Total Tracked (7 days)</p>
                </div>
                <p className="text-3xl font-bold text-white">{totalHours.toFixed(1)}h</p>
                <p className="text-xs text-white/40 mt-1 font-mono">Avg {(totalHours / (activeDays || 1)).toFixed(1)}h / active day</p>
              </div>
              <div className="glass-card p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-accent-400" />
                  <p className="text-xs font-medium text-white/40 uppercase tracking-wider">Active Days</p>
                </div>
                <p className="text-3xl font-bold text-white">{activeDays}</p>
                <p className="text-xs text-white/40 mt-1">Logged work sessions</p>
              </div>
              <div className="glass-card p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-success-400" />
                  <p className="text-xs font-medium text-white/40 uppercase tracking-wider">Screenshots Stored</p>
                </div>
                <p className="text-3xl font-bold text-white">{totalScreenshots}</p>
                <p className="text-xs text-white/40 mt-1">Encrypted on device</p>
              </div>
            </div>
          )}

          {/* Chart */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="section-title">Daily Work Hours (Last 7 Days)</h2>
                <p className="text-xs text-white/40">Aggregated session durations across active agents</p>
              </div>
              <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Firestore Telemetry
              </span>
            </div>
            {loading ? (
              <div className="h-48 shimmer rounded-xl" />
            ) : chartData.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-center p-6 text-white/40">
                <Clock className="w-8 h-8 mb-2 opacity-40 text-brand-400" />
                <p className="text-sm font-medium text-white/80">No work sessions recorded yet</p>
                <p className="text-xs text-white/40 mt-0.5">Real session hours will automatically plot here as employees log time.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)'} />
                  <XAxis dataKey="date" tick={{ fill: theme === 'light' ? '#64748b' : 'rgba(255,255,255,0.3)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: theme === 'light' ? '#64748b' : 'rgba(255,255,255,0.3)', fontSize: 12 }} axisLine={false} tickLine={false} unit="h" />
                  <Tooltip
                    contentStyle={theme === 'light'
                      ? { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, color: '#0f172a', fontSize: 13, boxShadow: '0 4px 14px rgba(0,0,0,0.08)' }
                      : { background: '#16162a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: 'white', fontSize: 13 }}
                    cursor={{ fill: theme === 'light' ? 'rgba(107,107,245,0.08)' : 'rgba(107,107,245,0.1)' }}
                  />
                  <Bar dataKey="hours" radius={[6, 6, 0, 0]}>
                    {chartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#6b6bf5' : '#5656ea'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Table */}
          <div className="glass-card p-5">
            <h2 className="section-title mb-4">Daily Summary Logs</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    {['Date', 'Employee', 'Sessions', 'Total Hours', 'Screenshots'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-white/30 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {summaries.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-xs text-white/40">
                        No work session records found in Cloud Firestore.
                      </td>
                    </tr>
                  ) : (
                    summaries.slice(0, 15).map((s, i) => {
                      const emp = employees.find(e => e.id === s.employeeId)
                      return (
                        <tr key={i} className="hover:bg-surface-700/30 transition-colors">
                          <td className="px-4 py-3 text-sm font-mono text-white/60">{s.date}</td>
                          <td className="px-4 py-3 text-sm text-white font-medium">{emp?.name ?? s.employeeId}</td>
                          <td className="px-4 py-3 text-sm text-white/60">{s.sessionCount}</td>
                          <td className="px-4 py-3 text-sm font-mono text-white/80">{formatHours(s.totalSessionSeconds)}</td>
                          <td className="px-4 py-3 text-sm text-white/60">{s.screenshotCount}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: Activity & Productivity Timeline ── */}
      {activeTab === 'productivity' && (
        <div className="space-y-5 animate-fade-in">
          {/* Top Activity Stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className="glass-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 text-brand-400" />
                <span className="text-xs font-medium text-white/40 uppercase">Avg Productivity</span>
              </div>
              <p className="text-2xl font-bold text-white">92.4%</p>
              <p className="text-[11px] text-success-400 mt-1">↑ +3.2% vs last week</p>
            </div>

            <div className="glass-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-accent-400" />
                <span className="text-xs font-medium text-white/40 uppercase">Active vs Idle</span>
              </div>
              <p className="text-2xl font-bold text-white">88% / 12%</p>
              <p className="text-[11px] text-white/40 mt-1">Within standard policy</p>
            </div>

            <div className="glass-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Keyboard className="w-4 h-4 text-warning-400" />
                <span className="text-xs font-medium text-white/40 uppercase">Keystroke Intensity</span>
              </div>
              <p className="text-2xl font-bold text-white">1,940/hr</p>
              <p className="text-[11px] text-white/40 mt-1">Total count (keys not logged)</p>
            </div>

            <div className="glass-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <MousePointer className="w-4 h-4 text-success-400" />
                <span className="text-xs font-medium text-white/40 uppercase">Mouse Activity</span>
              </div>
              <p className="text-2xl font-bold text-white">580 clicks/hr</p>
              <p className="text-[11px] text-white/40 mt-1">Movement frequency: High</p>
            </div>
          </div>

          {/* Area Chart: Active vs Idle Time Throughout Workday */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="section-title">Workday Activity Rhythm (Active vs Idle Minutes)</h3>
                <p className="text-xs text-white/40">Hourly breakdown of active work vs idle timeouts</p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5 text-brand-300">
                  <span className="w-2.5 h-2.5 rounded-full bg-brand-500" /> Active Minutes
                </span>
                <span className="flex items-center gap-1.5 text-warning-300">
                  <span className="w-2.5 h-2.5 rounded-full bg-warning-500" /> Idle Minutes
                </span>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={activityMetrics} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="activeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6b6bf5" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#6b6bf5" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="idleGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#eab308" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#eab308" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)'} />
                <XAxis dataKey="timestamp" tick={{ fill: theme === 'light' ? '#64748b' : 'rgba(255,255,255,0.4)', fontSize: 12 }} />
                <YAxis tick={{ fill: theme === 'light' ? '#64748b' : 'rgba(255,255,255,0.4)', fontSize: 12 }} unit="m" />
                <Tooltip
                  contentStyle={theme === 'light'
                    ? { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, color: '#0f172a', fontSize: 13, boxShadow: '0 4px 14px rgba(0,0,0,0.08)' }
                    : { background: '#16162a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: 'white' }}
                />
                <Area type="monotone" dataKey="activeMinutes" stroke="#6b6bf5" fillOpacity={1} fill="url(#activeGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="idleMinutes" stroke="#eab308" fillOpacity={1} fill="url(#idleGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── TAB 3: App & Web Usage ── */}
      {activeTab === 'apps' && (
        <div className="grid grid-cols-2 gap-5 animate-fade-in">
          {/* Top Applications */}
          <div className="glass-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="section-title flex items-center gap-2">
                  <Layers className="w-4 h-4 text-brand-400" />
                  Top Applications Used
                </h3>
                <p className="text-xs text-white/40">Sorted by total active screen time</p>
              </div>
            </div>

            <div className="space-y-3">
              {appUsages.length === 0 ? (
                <div className="py-12 text-center text-white/40 text-xs">
                  No application activity logged yet.
                </div>
              ) : (
                appUsages.map(app => (
                  <div key={app.id} className="p-3 rounded-xl bg-surface-700/50 border border-white/5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">{app.appName}</p>
                        <p className="text-[11px] text-white/40 truncate max-w-xs">{app.windowTitle}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-mono font-bold text-white">{formatHours(app.durationSeconds)}</span>
                        <p className="text-[10px] text-success-400">{app.productivityScore}% score</p>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          app.category === 'productive' ? 'bg-brand-500' : 'bg-warning-500'
                        }`}
                        style={{ width: `${Math.min(100, (app.durationSeconds / 18000) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Top Websites */}
          <div className="glass-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="section-title flex items-center gap-2">
                  <Globe className="w-4 h-4 text-accent-400" />
                  Top Domains & Websites Visited
                </h3>
                <p className="text-xs text-white/40">Aggregated browser activity logs</p>
              </div>
            </div>

            <div className="space-y-3">
              {webUsages.length === 0 ? (
                <div className="py-12 text-center text-white/40 text-xs">
                  No browser activity logged yet.
                </div>
              ) : (
                webUsages.map(web => (
                  <div key={web.id} className="p-3 rounded-xl bg-surface-700/50 border border-white/5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white font-mono">{web.domain}</p>
                        <p className="text-[11px] text-white/40 truncate max-w-xs">{web.title}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-mono font-bold text-white">{formatHours(web.durationSeconds)}</span>
                        <p className="text-[10px] text-white/40">{web.visitCount} visits</p>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          web.category === 'productive' ? 'bg-accent-500' : 'bg-warning-500'
                        }`}
                        style={{ width: `${Math.min(100, (web.durationSeconds / 10000) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
