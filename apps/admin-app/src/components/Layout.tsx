import { Outlet, NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Monitor,
  Camera,
  Clock,
  FileBarChart2,
  Settings,
  Shield,
  ShieldAlert,
  ChevronRight,
  LogOut,
} from 'lucide-react'
import WindowControls from './WindowControls'
import { UserAccount } from '@worktrack-pro/shared'

const NAV_ITEMS = [
  { to: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/employees',   icon: Users,           label: 'Employees' },
  { to: '/monitor',     icon: Monitor,         label: 'Live Monitor' },
  { to: '/screenshots', icon: Camera,          label: 'Screenshots' },
  { to: '/sessions',    icon: Clock,           label: 'Work Sessions' },
  { to: '/reports',     icon: FileBarChart2,   label: 'Analytics & Reports' },
  { to: '/approvals',   icon: ShieldAlert,     label: 'Approvals & Alerts' },
  { to: '/settings',    icon: Settings,        label: 'Settings' },
]

export interface LayoutProps {
  user?: UserAccount | null
  isDemo?: boolean
  onSignOut?: () => void
}

export default function Layout({ user, isDemo = false, onSignOut }: LayoutProps) {
  const location = useLocation()

  const currentPage = NAV_ITEMS.find(n =>
    location.pathname.startsWith(n.to)
  )?.label ?? 'Dashboard'

  return (
    <div className="flex h-full w-full overflow-hidden bg-surface-950">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="w-60 flex-shrink-0 flex flex-col border-r border-white/5 bg-surface-900">
        {/* Logo / App name */}
        <div className="px-4 py-5 border-b border-white/5 titlebar-drag">
          <div className="flex items-center gap-3 titlebar-no-drag">
            <div className="w-8 h-8 rounded-xl bg-brand-600 flex items-center justify-center shadow-glow-brand">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-none">WorkTrack Pro</p>
              <p className="text-[10px] text-brand-400 leading-none mt-0.5 font-medium tracking-wide uppercase">Admin Console</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                isActive ? 'nav-item-active' : 'nav-item'
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{label}</span>
              {location.pathname.startsWith(to) && (
                <ChevronRight className="w-3 h-3 ml-auto opacity-60" />
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-white/5">
          <div className="glass-card p-3 space-y-1">
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${isDemo ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`} />
              <p className="text-[11px] font-semibold text-white">
                {isDemo ? 'Offline Demo Mode' : 'Firestore Live'}
              </p>
            </div>
            <p className="text-[9px] text-white/40 font-mono leading-relaxed truncate">
              {isDemo ? 'Local mock datasets' : 'Cloud Sync · worktrack-pro-8aa42'}
            </p>
          </div>
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 border-b border-white/5 bg-surface-900/50 flex items-center px-6 gap-4 titlebar-drag flex-shrink-0">
          <div className="titlebar-no-drag flex items-center gap-4 w-full">
            <h1 className="text-sm font-semibold text-white">{currentPage}</h1>
            <div className="ml-auto flex items-center gap-3">
              {/* Mode indicator */}
              <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 ${
                isDemo
                  ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                  : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isDemo ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`} />
                {isDemo ? 'Demo Mode' : 'Firebase Cloud'}
              </span>

              {/* Admin identity badge */}
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-surface-800/60 border border-white/5">
                <div className="w-6 h-6 rounded-md bg-brand-600 flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
                  {user?.displayName ? user.displayName.charAt(0).toUpperCase() : 'A'}
                </div>
                <div className="text-left hidden sm:block">
                  <div className="text-[11px] font-medium text-white truncate max-w-[120px]">
                    {user?.displayName || 'Administrator'}
                  </div>
                  <div className="text-[9px] text-brand-400 uppercase font-mono font-semibold">
                    {user?.role || 'ADMIN'}
                  </div>
                </div>
              </div>

              {/* Sign out button */}
              {onSignOut && (
                <button
                  id="btn-admin-sign-out"
                  type="button"
                  onClick={onSignOut}
                  title="Sign out of Admin session"
                  className="p-1.5 rounded-lg text-white/50 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all text-xs flex items-center gap-1"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}

              <div className="h-4 w-px bg-white/10 mx-1" />
              <WindowControls />
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
