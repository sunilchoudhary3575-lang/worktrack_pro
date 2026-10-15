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

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
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
