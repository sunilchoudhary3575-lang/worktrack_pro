import { useState } from 'react'
import { Shield, Lock, Mail, AlertCircle, Info, ArrowRight, Loader2, Sun, Moon } from 'lucide-react'
import { adminAuthService } from '../services/firebaseAuth'
import { UserAccount } from '@worktrack-pro/shared'
import { useTheme } from '../context/ThemeContext'

interface AdminSignInProps {
  onSignedIn: (user: UserAccount, isDemo: boolean) => void
}

export default function AdminSignIn({ onSignedIn }: AdminSignInProps) {
  const { theme, toggleTheme } = useTheme()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isConfigured = adminAuthService.isConfigured()

  const handleSignIn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setError(null)

    const targetEmail = email.trim()
    const targetPassword = password.trim()

    if (!targetEmail || !targetPassword) {
      setError('Please provide both your administrator email and password.')
      return
    }

    setLoading(true)
    try {
      const result = await adminAuthService.signIn(targetEmail, targetPassword)
      onSignedIn(result.user, result.isDemo)
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  const handleDemoSignIn = () => {
    setError(null)
    const result = adminAuthService.signInDemo()
    onSignedIn(result.user, result.isDemo)
  }

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      {/* Top right theme toggle */}
      <div className="absolute top-4 right-4 z-20">
        <button
          id="btn-theme-toggle-signin"
          type="button"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-white/70 hover:text-white bg-surface-800/80 hover:bg-surface-700 border border-white/10 transition-all cursor-pointer shadow-sm active:scale-95"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px]">Light Mode</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5 text-indigo-500" />
              <span className="text-[11px]">Dark Mode</span>
            </>
          )}
        </button>
      </div>

      {/* Background radial glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md space-y-6 relative z-10">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-500/10 border border-brand-500/20 text-brand-400 mb-2 shadow-lg shadow-brand-500/5">
            <Shield className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">WorkTrack Pro</h1>
          <p className="text-xs uppercase font-mono tracking-widest text-brand-400">Executive Administration Suite</p>
          <p className="text-xs text-white/50 pt-1">
            Sign in with your authorized corporate administrative credentials.
          </p>
        </div>

        {/* Configuration Status Banner */}
        {!isConfigured ? (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200/90 text-xs space-y-1.5 animate-fade-in">
            <div className="flex items-center gap-2 font-semibold text-amber-300">
              <Info className="w-4 h-4 flex-shrink-0" />
              <span>Firebase Cloud Auth Not Configured</span>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-200/80">
              Environment variables (<code>.env</code>) have not been configured with a live Firebase project yet.
              You can test the entire application using the <strong>Offline Demo Admin</strong> mode below.
            </p>
          </div>
        ) : (
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Connected to Firebase Cloud Authentication</span>
          </div>
        )}

        {/* Main Card */}
        <div className="glass-card p-6 border-white/10 shadow-2xl space-y-5">
          {error && (
            <div
              id="admin-auth-error-alert"
              className="p-3 rounded-lg bg-red-500/15 border border-red-500/30 text-red-200 text-xs flex items-start gap-2 animate-shake"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
              <div className="flex-1 font-medium">{error}</div>
            </div>
          )}

          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="admin-email" className="block text-xs font-semibold text-white/80">
                Administrator Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="admin-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@company.com"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-surface-900 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="admin-password" className="block text-xs font-semibold text-white/80">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="admin-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-surface-900 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
                />
              </div>
            </div>

            <button
              id="btn-admin-sign-in"
              type="submit"
              disabled={loading || !isConfigured}
              className="btn-primary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-brand-500/20"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Offline / Demo Fallback Mode */}
          <div className="pt-3 border-t border-white/10">
            <button
              id="btn-admin-demo-mode"
              type="button"
              onClick={handleDemoSignIn}
              className="w-full py-2 px-3 text-xs rounded-lg bg-surface-800/80 hover:bg-surface-800 border border-white/10 text-white/80 hover:text-white font-medium flex items-center justify-center gap-2 transition-all"
            >
              <Shield className="w-3.5 h-3.5 text-brand-400" />
              <span>Continue with Offline Demo Admin</span>
            </button>
            <p className="text-[10px] text-center text-white/40 pt-2">
              For local testing with mock records without cloud connectivity.
            </p>
          </div>
        </div>

        {/* Security Notice */}
        <div className="p-3 rounded-xl bg-surface-900/60 border border-white/5 text-[11px] text-white/40 space-y-1 text-center">
          <p>
            🔒 <strong>Strict Privilege Notice:</strong> Standard employee credentials cannot access the Executive Administration Suite. New admin accounts must be provisioned via the secure bootstrap script.
          </p>
        </div>
      </div>
    </div>
  )
}
