import { useState, useEffect } from 'react'
import {
  ShieldAlert,
  CheckCircle,
  XCircle,
  Clock,
  Key,
  EyeOff,
  AlertTriangle,
  Filter,
  User,
  Sparkles,
  Search,
} from 'lucide-react'
import { dataService } from '../services/dataService'
import type { ApprovalRequest, ApprovalStatus, ApprovalType } from '@worktrack-pro/shared'

const TYPE_ICONS: Record<ApprovalType, React.ElementType> = {
  access: Key,
  overtime: Clock,
  privacy_review: EyeOff,
  off_track_alert: AlertTriangle,
}

const TYPE_COLORS: Record<ApprovalType, string> = {
  access: 'bg-brand-500/15 text-brand-400 border-brand-500/20',
  overtime: 'bg-accent-500/15 text-accent-400 border-accent-500/20',
  privacy_review: 'bg-warning-500/15 text-warning-400 border-warning-500/20',
  off_track_alert: 'bg-danger-500/15 text-danger-400 border-danger-500/20',
}

export default function Approvals() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)

  useEffect(() => {
    dataService.getApprovalRequests().then(setRequests)
  }, [])

  const handleResolve = async (id: string, status: 'approved' | 'rejected') => {
    setActionInProgress(id)
    await dataService.resolveApprovalRequest(id, status)
    setRequests(prev =>
      prev.map(r =>
        r.id === id
          ? { ...r, status, resolvedAt: new Date(), resolvedBy: 'Admin User' }
          : r
      )
    )
    setActionInProgress(null)
  }

  const filtered = requests.filter(r => {
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter
    const matchesSearch =
      r.employeeName.toLowerCase().includes(search.toLowerCase()) ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.department.toLowerCase().includes(search.toLowerCase())
    return matchesStatus && matchesSearch
  })

  const pendingCount = requests.filter(r => r.status === 'pending').length

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header stats & filter */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-brand-400" />
            Remote Approvals & Alerts Queue
            {pendingCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-500/20 text-brand-300 border border-brand-500/30">
                {pendingCount} Pending
              </span>
            )}
          </h2>
          <p className="text-xs text-white/40 mt-1">
            Review live permission requests, overtime authorizations, and privacy redaction flags
          </p>
        </div>

        {/* Filter controls */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search approvals..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-field pl-9 w-52 py-1.5 text-xs"
            />
          </div>

          <div className="flex items-center gap-1 bg-surface-800 p-1 rounded-xl border border-white/5">
            {(['all', 'pending', 'approved', 'rejected'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all ${
                  statusFilter === tab
                    ? 'bg-brand-600 text-white shadow-glow-brand'
                    : 'text-white/40 hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Requests List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <Sparkles className="w-8 h-8 text-white/20 mx-auto mb-2" />
            <p className="text-sm text-white/60 font-medium">No approval requests found</p>
            <p className="text-xs text-white/30 mt-1">
              {statusFilter !== 'all' ? `No ${statusFilter} requests match your filter` : 'Queue is currently clear'}
            </p>
          </div>
        ) : (
          filtered.map(req => {
            const Icon = TYPE_ICONS[req.type] || ShieldAlert
            const isPending = req.status === 'pending'
            const isProcessing = actionInProgress === req.id

            return (
              <div
                key={req.id}
                className="glass-card p-5 transition-all hover:border-brand-500/20 space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center border flex-shrink-0 ${
                        TYPE_COLORS[req.type]
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-white">{req.title}</span>
                        <span
                          className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${
                            req.urgency === 'high'
                              ? 'bg-danger-500/15 text-danger-400 border-danger-500/25'
                              : req.urgency === 'medium'
                              ? 'bg-warning-500/15 text-warning-400 border-warning-500/25'
                              : 'bg-white/10 text-white/50 border-white/10'
                          }`}
                        >
                          {req.urgency} urgency
                        </span>
                        <span
                          className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${
                            req.status === 'approved'
                              ? 'bg-success-500/15 text-success-400 border-success-500/25'
                              : req.status === 'rejected'
                              ? 'bg-danger-500/15 text-danger-400 border-danger-500/25'
                              : 'bg-brand-500/15 text-brand-300 border-brand-500/25'
                          }`}
                        >
                          {req.status}
                        </span>
                      </div>

                      <p className="text-xs text-white/60 mt-1 leading-relaxed">
                        {req.description}
                      </p>

                      <div className="flex items-center gap-4 mt-2.5 text-[11px] text-white/35 font-mono">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 text-white/30" />
                          <strong className="text-white/60 font-sans">{req.employeeName}</strong> ({req.department})
                        </span>
                        <span>•</span>
                        <span>{new Date(req.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {req.resolvedAt && (
                          <>
                            <span>•</span>
                            <span className="text-white/40">
                              Resolved by {req.resolvedBy} at {new Date(req.resolvedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  {isPending && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleResolve(req.id, 'rejected')}
                        disabled={isProcessing}
                        className="btn-secondary py-1.5 px-3 text-xs text-danger-400 hover:text-danger-300 hover:border-danger-500/30"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Reject
                      </button>
                      <button
                        onClick={() => handleResolve(req.id, 'approved')}
                        disabled={isProcessing}
                        className="btn-primary py-1.5 px-3 text-xs bg-success-600 hover:bg-success-500 shadow-none hover:shadow-[0_0_15px_rgba(34,197,94,0.3)]"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Approve
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
