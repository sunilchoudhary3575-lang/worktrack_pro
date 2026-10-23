import {
  CheckCircle2,
  XCircle,
  Clock,
  Coffee,
  Key,
  ShieldAlert,
  AlertCircle,
  HelpCircle,
} from 'lucide-react'
import type {
  AccountStatus,
  DeviceApprovalState,
  PresenceStatus,
  SessionState,
  DeviceStatus,
  SessionStatus,
} from '@worktrack-pro/shared'

// ─── 1. Account Status Badge ─────────────────────────────────
export function AccountStatusBadge({
  status,
  size = 'sm',
}: {
  status: AccountStatus
  size?: 'sm' | 'md'
}) {
  if (status === 'activated') {
    return (
      <span
        data-testid="badge-account-activated"
        className={`inline-flex items-center gap-1 font-semibold rounded-full border bg-emerald-500/15 text-emerald-400 border-emerald-500/25 ${
          size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[10px]'
        }`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        Activated
      </span>
    )
  }
  if (status === 'disabled') {
    return (
      <span
        data-testid="badge-account-disabled"
        className={`inline-flex items-center gap-1 font-semibold rounded-full border bg-rose-500/15 text-rose-400 border-rose-500/25 ${
          size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[10px]'
        }`}
      >
        <ShieldAlert className="w-3 h-3" />
        Disabled
      </span>
    )
  }
  return (
    <span
      data-testid="badge-account-not-activated"
      className={`inline-flex items-center gap-1 font-semibold rounded-full border bg-amber-500/15 text-amber-300 border-amber-500/25 ${
        size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[10px]'
      }`}
    >
      <Key className="w-3 h-3" />
      Not activated
    </span>
  )
}

// ─── 2. Device Approval State Badge ──────────────────────────
export function DeviceApprovalBadge({
  status,
  size = 'sm',
}: {
  status: DeviceApprovalState
  size?: 'sm' | 'md'
}) {
  if (status === 'approved') {
    return (
      <span
        data-testid="badge-device-approved"
        className={`inline-flex items-center gap-1 font-semibold rounded-full border bg-success-500/15 text-success-400 border-success-500/25 ${
          size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[10px]'
        }`}
      >
        <CheckCircle2 className="w-3 h-3" />
        Approved
      </span>
    )
  }
  if (status === 'pending') {
    return (
      <span
        data-testid="badge-device-pending"
        className={`inline-flex items-center gap-1 font-semibold rounded-full border bg-warning-500/15 text-warning-400 border-warning-500/25 ${
          size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[10px]'
        }`}
      >
        <Clock className="w-3 h-3 animate-pulse" />
        Pending
      </span>
    )
  }
  if (status === 'rejected') {
    return (
      <span
        data-testid="badge-device-rejected"
        className={`inline-flex items-center gap-1 font-semibold rounded-full border bg-danger-500/15 text-danger-400 border-danger-500/25 ${
          size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[10px]'
        }`}
      >
        <XCircle className="w-3 h-3" />
        Rejected
      </span>
    )
  }
  return (
    <span
      data-testid="badge-device-unregistered"
      className={`inline-flex items-center gap-1 font-semibold rounded-full border bg-white/5 text-white/40 border-white/10 ${
        size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[10px]'
      }`}
    >
      Unregistered
    </span>
  )
}

// ─── 3. Presence Status Badge ────────────────────────────────
export function PresenceBadge({
  status,
  size = 'sm',
  title,
}: {
  status: PresenceStatus
  size?: 'sm' | 'md'
  title?: string
}) {
  if (status === 'online') {
    return (
      <span
        data-testid="badge-presence-online"
        title={title || 'Online (Active heartbeat within last 3 minutes)'}
        className={`inline-flex items-center gap-1.5 font-medium text-emerald-400 ${
          size === 'md' ? 'text-xs' : 'text-[11px]'
        }`}
      >
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50" />
        Online
      </span>
    )
  }
  if (status === 'offline') {
    return (
      <span
        data-testid="badge-presence-offline"
        title={title || 'Offline (No heartbeat in past 3 minutes)'}
        className={`inline-flex items-center gap-1.5 font-medium text-white/40 ${
          size === 'md' ? 'text-xs' : 'text-[11px]'
        }`}
      >
        <span className="w-2 h-2 rounded-full bg-surface-500" />
        Offline
      </span>
    )
  }
  return (
    <span
      data-testid="badge-presence-unknown"
      title={title || 'Unknown (No heartbeat recorded)'}
      className={`inline-flex items-center gap-1.5 font-medium text-white/30 italic ${
        size === 'md' ? 'text-xs' : 'text-[11px]'
      }`}
    >
      <span className="w-2 h-2 rounded-full border border-dashed border-white/30" />
      Unknown
    </span>
  )
}

// ─── 4. Session State Badge ──────────────────────────────────
export function SessionStateBadge({
  status,
  size = 'sm',
}: {
  status: SessionState
  size?: 'sm' | 'md'
}) {
  if (status === 'working') {
    return (
      <span
        data-testid="badge-session-working"
        className={`inline-flex items-center gap-1 font-bold text-success-400 bg-success-500/10 border border-success-500/20 rounded-full ${
          size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[10px]'
        }`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-success-400 animate-pulse" />
        Working
      </span>
    )
  }
  if (status === 'on_break') {
    return (
      <span
        data-testid="badge-session-on-break"
        className={`inline-flex items-center gap-1 font-bold text-warning-400 bg-warning-500/10 border border-warning-500/20 rounded-full ${
          size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[10px]'
        }`}
      >
        <Coffee className="w-3 h-3" />
        On break
      </span>
    )
  }
  if (status === 'ended') {
    return (
      <span
        data-testid="badge-session-ended"
        className={`inline-flex items-center gap-1 font-medium text-white/50 bg-white/5 border border-white/10 rounded-full ${
          size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[10px]'
        }`}
      >
        Ended
      </span>
    )
  }
  return (
    <span
      data-testid="badge-session-no-session"
      className={`inline-flex items-center gap-1 font-medium text-white/30 ${
        size === 'md' ? 'text-xs' : 'text-[11px]'
      }`}
    >
      No session
    </span>
  )
}

// ─── Legacy Compatible Default StatusBadge ───────────────────
interface Props {
  status: DeviceStatus | SessionStatus | PresenceStatus | string
  showLabel?: boolean
  size?: 'sm' | 'md'
  title?: string
}

const CONFIG = {
  online:      { dot: 'status-dot-online',  label: 'Online',      text: 'text-success-400' },
  active:      { dot: 'status-dot-online',  label: 'Active',      text: 'text-success-400' },
  working:     { dot: 'status-dot-online',  label: 'Working',     text: 'text-success-400' },
  idle:        { dot: 'status-dot-idle',    label: 'Idle',        text: 'text-warning-400' },
  paused:      { dot: 'status-dot-idle',    label: 'Paused',      text: 'text-warning-400' },
  on_break:    { dot: 'status-dot-idle',    label: 'On Break',    text: 'text-warning-400' },
  offline:     { dot: 'status-dot-offline', label: 'Offline',     text: 'text-white/30' },
  ended:       { dot: 'status-dot-offline', label: 'Ended',       text: 'text-white/30' },
  not_started: { dot: 'status-dot-offline', label: 'Not Started', text: 'text-white/30' },
  unknown:     { dot: 'status-dot-offline', label: 'Unknown',     text: 'text-white/30 italic' },
} as const

export default function StatusBadge({ status, showLabel = true, size = 'sm', title }: Props) {
  const cfg = CONFIG[status as keyof typeof CONFIG] ?? CONFIG.offline
  return (
    <span
      title={title}
      className={`flex items-center gap-1.5 ${size === 'md' ? 'text-sm' : 'text-xs'}`}
    >
      <span className={`status-dot ${cfg.dot}`} />
      {showLabel && (
        <span className={`font-medium ${cfg.text}`}>{cfg.label}</span>
      )}
    </span>
  )
}
