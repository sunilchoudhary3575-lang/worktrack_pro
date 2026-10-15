import type { DeviceStatus } from '@worktrack-pro/shared'

interface Props {
  status: DeviceStatus | 'active' | 'ended' | 'paused'
  showLabel?: boolean
  size?: 'sm' | 'md'
}

const CONFIG = {
  online:  { dot: 'status-dot-online',  label: 'Online',  text: 'text-success-400' },
  active:  { dot: 'status-dot-online',  label: 'Active',  text: 'text-success-400' },
  idle:    { dot: 'status-dot-idle',    label: 'Idle',    text: 'text-warning-400' },
  paused:  { dot: 'status-dot-idle',    label: 'Paused',  text: 'text-warning-400' },
  offline: { dot: 'status-dot-offline', label: 'Offline', text: 'text-white/30' },
  ended:   { dot: 'status-dot-offline', label: 'Ended',   text: 'text-white/30' },
} as const

export default function StatusBadge({ status, showLabel = true, size = 'sm' }: Props) {
  const cfg = CONFIG[status as keyof typeof CONFIG] ?? CONFIG.offline
  return (
    <span className={`flex items-center gap-1.5 ${size === 'md' ? 'text-sm' : 'text-xs'}`}>
      <span className={`status-dot ${cfg.dot}`} />
      {showLabel && (
        <span className={`font-medium ${cfg.text}`}>{cfg.label}</span>
      )}
    </span>
  )
}
