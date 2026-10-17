import { useState } from 'react'
import { Monitor, Lock, User, Eye, EyeOff, AlertCircle, Info, ArrowRight, Loader2, Sparkles } from 'lucide-react'
import { employeeAuthService } from '../services/firebaseAuth'
import { UserAccount } from '@worktrack-pro/shared'

interface EmployeeSignInProps {
  onSignedIn: (user: UserAccount, isDemo: boolean) => void
}

export default function EmployeeSignInScreen({ onSignedIn }: EmployeeSignInProps) {
  const [employeeId, setEmployeeId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isConfigured = employeeAuthService.isConfigured()

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!employeeId.trim() || !password.trim()) {
      setError('Please enter both your Employee ID and password.')
      return
    }

    setLoading(true)
    try {
      const result = await employeeAuthService.signIn(employeeId.trim(), password)
      onSignedIn(result.user, result.isDemo)
    } catch (err: any) {
      setError(err.message || 'Invalid Employee ID or password. Please verify your credentials.')
    } finally {
      setLoading(false)
    }
  }

  const handleDemoSignIn = () => {
    setError(null)
    const result = employeeAuthService.signInDemo()
    onSignedIn(result.user, result.isDemo)
  }

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden select-none">
      {/* Background emerald gradient accent */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm space-y-5 relative z-10 animate-fade-in">
        {/* Brand Header */}
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-1 shadow-lg shadow-emerald-500/10">
            <Monitor className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">WorkTrack Pro</h1>
          <p className="text-[11px] uppercase tracking-wider text-emerald-400 font-mono font-semibold">
            Employee Workspace
          </p>
          <p className="text-xs text-white/50 pt-0.5">
            Sign in with your assigned Employee ID and password.
          </p>
        </div>

        {/* Configuration Notice */}
        {!isConfigured ? (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-amber-300">
              <Info className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Firebase Cloud Auth Not Configured</span>
            </div>
            <p className="text-[10px] text-amber-200/80 leading-relaxed">
              No <code>.env</code> credentials found. You can test existing Phase 3–8 features in <strong>Demo Mode</strong>.
            </p>
          </div>
        ) : (
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] flex items-center justify-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Connected to Firebase Cloud</span>
          </div>
        )}

        {/* Sign In Card */}
        <div className="glass-card p-5 border-white/10 shadow-2xl space-y-4">
          {error && (
            <div
              id="employee-auth-error-alert"
              className="p-2.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-200 text-xs flex items-start gap-2 animate-shake"
            >
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-red-400" />
              <div className="flex-1 text-[11px] font-medium">{error}</div>
            </div>
          )}

          <form onSubmit={handleSignIn} className="space-y-3.5">
            <div className="space-y-1">
              <label htmlFor="employee-id" className="block text-[11px] font-semibold text-white/80">
                Employee ID
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="employee-id"
                  type="text"
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={employeeId}
                  onChange={e => setEmployeeId(e.target.value)}
                  placeholder="e.g. emp_001"
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-lg bg-surface-900 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors font-mono"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="employee-password" className="block text-[11px] font-semibold text-white/80">
                Password
              </label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="employee-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-8 pr-9 py-2 text-xs rounded-lg bg-surface-900 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  tabIndex={-1}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 focus:outline-none"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <button
              id="btn-employee-sign-in"
              type="submit"
              disabled={loading || !isConfigured}
              className="btn-primary w-full py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>

          {/* Demo Fallback */}
          <div className="pt-2 border-t border-white/5 space-y-1.5">
            <button
              id="btn-employee-demo-mode"
              type="button"
              onClick={handleDemoSignIn}
              className="w-full py-1.5 px-3 text-[11px] rounded-lg bg-surface-800/80 hover:bg-surface-800 border border-white/10 text-white/80 hover:text-white font-medium flex items-center justify-center gap-1.5 transition-all"
            >
              <Sparkles className="w-3 h-3 text-emerald-400" />
              <span>Continue with Offline Demo Employee</span>
            </button>
            <p className="text-[9px] text-center text-white/30">
              Allows immediate manual testing of Phases 3–8 offline.
            </p>
          </div>
        </div>

        {/* Security and Privacy Notice */}
        <div className="p-2.5 rounded-xl bg-surface-900/60 border border-white/5 text-[10px] text-white/40 text-center leading-relaxed">
          Employee monitoring operates strictly under corporate policy with transparent indicators and local session safeguards.
        </div>
      </div>
    </div>
  )
}
