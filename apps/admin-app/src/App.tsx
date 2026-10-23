import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Employees from './pages/Employees'
import LiveMonitor from './pages/LiveMonitor'
import Screenshots from './pages/Screenshots'
import WorkSessions from './pages/WorkSessions'
import Reports from './pages/Reports'
import Approvals from './pages/Approvals'
import Settings from './pages/Settings'
import AdminSignIn from './pages/AdminSignIn'
import { adminAuthService } from './services/firebaseAuth'
import { UserAccount } from '@worktrack-pro/shared'
import { Shield, Loader2 } from 'lucide-react'

export default function App() {
  const [user, setUser] = useState<UserAccount | null>(null)
  const [isDemo, setIsDemo] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = adminAuthService.onAuthStateChanged((authedUser, demo) => {
      setUser(authedUser)
      setIsDemo(demo)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const handleSignOut = async () => {
    setLoading(true)
    try {
      await adminAuthService.signOut()
      setUser(null)
      setIsDemo(false)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center text-brand-400 animate-pulse">
          <Shield className="w-6 h-6" />
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-white/60">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400" />
          <span>Restoring Admin Session...</span>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <AdminSignIn
        onSignedIn={(authedUser, demo) => {
          setUser(authedUser)
          setIsDemo(demo)
        }}
      />
    )
  }

  return (
    <Routes>
      <Route path="/" element={<Layout user={user} isDemo={isDemo} onSignOut={handleSignOut} />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="employees" element={<Employees />} />
        <Route path="monitor" element={<LiveMonitor />} />
        <Route path="screenshots" element={<Screenshots />} />
        <Route path="sessions" element={<WorkSessions />} />
        <Route path="reports" element={<Reports />} />
        <Route path="approvals" element={<Approvals />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
